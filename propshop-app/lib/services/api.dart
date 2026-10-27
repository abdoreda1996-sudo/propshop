import 'viewing_slots.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:shared_preferences/shared_preferences.dart';

/// Thin client over the shared Next.js API. The web site and this app consume exactly
/// the same endpoints, so the two can never drift apart on business rules.
class ApiException implements Exception {
  ApiException(this.code, {this.status, this.body});
  final String code;
  final int? status;
  final Map<String, dynamic>? body;

  @override
  String toString() => 'ApiException($code, status: $status)';
}

/// Photos can be absolute (CDN, seeded demo images) or a server-relative path such as
/// `/media/listings/...` (photos uploaded through the back office, served by the web app).
/// Image widgets need an absolute URL, so every photo goes through this.
String absoluteMediaUrl(String url) =>
    url.startsWith('/') ? '${Api.defaultBaseUrl}$url' : url;

class Api {
  Api({String? baseUrl}) : baseUrl = baseUrl ?? defaultBaseUrl;

  /// 10.0.2.2 is the host machine from the Android emulator; override for a device.
  static const defaultBaseUrl = String.fromEnvironment(
    'AQAR_API',
    defaultValue: 'http://10.0.2.2:4100',
  );

  final String baseUrl;
  String? _accessToken;
  String? _refreshToken;

  static const _accessKey = 'aq_access';
  static const _refreshKey = 'aq_refresh';

  bool get isSignedIn => _accessToken != null;

  Future<void> loadTokens() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString(_accessKey);
    _refreshToken = prefs.getString(_refreshKey);
  }

  Future<void> _saveTokens(String? access, String? refresh) async {
    _accessToken = access;
    _refreshToken = refresh;
    final prefs = await SharedPreferences.getInstance();
    if (access == null) {
      await prefs.remove(_accessKey);
      await prefs.remove(_refreshKey);
    } else {
      await prefs.setString(_accessKey, access);
      if (refresh != null) await prefs.setString(_refreshKey, refresh);
    }
  }

  Future<void> signOut() async {
    try {
      await _send('POST', '/api/auth/logout');
    } catch (_) {
      // Signing out locally must succeed even if the network call does not.
    }
    await _saveTokens(null, null);
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
  };

  Future<http.Response> _send(String method, String path, {Object? body}) {
    final uri = Uri.parse('$baseUrl$path');
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'POST':
        return http.post(uri, headers: _headers, body: encoded);
      case 'PATCH':
        return http.patch(uri, headers: _headers, body: encoded);
      // Without this case a PUT silently fell through to GET (trade settings use PUT).
      case 'PUT':
        return http.put(uri, headers: _headers, body: encoded);
      case 'DELETE':
        return http.delete(uri, headers: _headers);
      default:
        return http.get(uri, headers: _headers);
    }
  }

  /// Sends a request, transparently refreshing the access token once on a 401.
  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Object? body,
    bool retryOnUnauthorized = true,
  }) async {
    http.Response res;
    try {
      res = await _send(
        method,
        path,
        body: body,
      ).timeout(const Duration(seconds: 30));
    } catch (_) {
      throw ApiException('network_error');
    }

    if (res.statusCode == 401 && retryOnUnauthorized && _refreshToken != null) {
      final refreshed = await _refresh();
      if (refreshed) {
        return request(method, path, body: body, retryOnUnauthorized: false);
      }
    }

    Map<String, dynamic> json;
    try {
      json = res.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('bad_response', status: res.statusCode);
    }

    if (res.statusCode >= 400) {
      throw ApiException(
        json['error']?.toString() ?? 'request_failed',
        status: res.statusCode,
        body: json,
      );
    }
    return json;
  }

  /// One refresh at a time. Screens load in parallel, so several requests can hit a 401
  /// together; if each spent the same refresh token, the server (which rotates it) would
  /// reject the second one and the user would be signed out for no reason.
  Future<bool>? _refreshing;

  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/api/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': _refreshToken}),
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) {
        // Only a refusal ends the session; a 5xx or a proxy error is not the user's fault.
        if (res.statusCode == 400 || res.statusCode == 401 || res.statusCode == 403) {
          await _saveTokens(null, null);
        }
        return false;
      }
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      await _saveTokens(
        json['accessToken'] as String?,
        json['refreshToken'] as String?,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  // --- Auth ---------------------------------------------------------------

  Future<Map<String, dynamic>> requestOtp(String phone) =>
      request('POST', '/api/auth/otp/request', body: {'phone': phone});

  Future<Map<String, dynamic>> verifyOtp(
    String phone,
    String code, {
    String? fullName,
  }) async {
    final json = await request(
      'POST',
      '/api/auth/otp/verify',
      body: {
        'phone': phone,
        'code': code,
        if (fullName != null) 'fullName': fullName,
      },
    );
    await _saveTokens(
      json['accessToken'] as String?,
      json['refreshToken'] as String?,
    );
    return json;
  }

  Future<Map<String, dynamic>> me() => request('GET', '/api/auth/me');

  /// Staff (team) sign-in with email + password — same endpoint as the website.
  Future<Map<String, dynamic>> loginWithPassword(String email, String password) async {
    final json = await request(
      'POST',
      '/api/auth/login',
      body: {'email': email, 'password': password},
      retryOnUnauthorized: false,
    );
    await _saveTokens(
      json['accessToken'] as String?,
      json['refreshToken'] as String?,
    );
    return json;
  }

  // --- Staff back office ----------------------------------------------------

  /// The queues this staff member may open, with badge counts.
  Future<Map<String, dynamic>> staffQueues() => request('GET', '/api/admin/queues');

  /// One queue page: items, total, filters, allowed bulk actions, assignable staff.
  Future<Map<String, dynamic>> staffQueue(
    String queue, {
    int page = 1,
    Map<String, String> filters = const {},
  }) {
    final qs = Uri(queryParameters: {
      'page': '$page',
      for (final e in filters.entries)
        if (e.value.isNotEmpty) e.key: e.value,
    }).query;
    return request('GET', '/api/admin/queues/$queue?$qs');
  }

  /// One action over many selected items — the website's bulk endpoint.
  Future<Map<String, dynamic>> staffBulk({
    required String entity,
    required String action,
    required List<String> ids,
    String? reason,
    String? staffId,
    bool assign = false,
  }) =>
      request('POST', '/api/admin/bulk', body: {
        'entity': entity,
        'action': action,
        'ids': ids,
        'params': {
          if (reason != null) 'reason': reason,
          if (assign) 'staffId': staffId,
        },
      });

  // --- Listings -----------------------------------------------------------

  Future<Map<String, dynamic>> searchListings({
    String? purpose,

    /// Only units open to trade (any purpose) — the "Trade" option of the switch.
    bool trade = false,

    /// Only "بدون أوفر" units (sold at the original contract price) — the Filters
    /// panel's "Units without over price" checkbox.
    bool withoutOver = false,

    /// residential | commercial | coastal. The server owns what each one means.
    ///
    /// Every list below is a multi-select facet, sent as a REPEATED query parameter
    /// (`type=villa&type=duplex`): values OR within a filter, filters AND together — the
    /// website's faceted rule. An empty list sends nothing (no restriction).
    List<String> segments = const [],
    List<String> areas = const [],
    List<String> compounds = const [],
    List<String> types = const [],
    int? minPrice,
    int? maxPrice,

    /// Exact counts, as the website's facets: beds "0" = studio, "5" = 5+; baths "4" = 4+.
    /// (The older `bedrooms=N`, "at least N", is no longer sent.)
    List<String> beds = const [],
    List<String> baths = const [],
    List<String> finishings = const [],
    List<String> deliveries = const [],
    List<String> payments = const [],
    String? q,
    String? sort,
    int page = 1,
  }) {
    // Uri writes an Iterable value as one `key=value` pair per element.
    final params = <String, dynamic>{
      if (purpose != null) 'purpose': purpose,
      if (trade) 'trade': 'open',
      if (withoutOver) 'over': 'none',
      if (segments.isNotEmpty) 'segment': segments,
      if (areas.isNotEmpty) 'area': areas,
      if (compounds.isNotEmpty) 'compound': compounds,
      if (types.isNotEmpty) 'type': types,
      if (minPrice != null) 'minPrice': '$minPrice',
      if (maxPrice != null) 'maxPrice': '$maxPrice',
      if (beds.isNotEmpty) 'beds': beds,
      if (baths.isNotEmpty) 'baths': baths,
      if (finishings.isNotEmpty) 'finishing': finishings,
      if (deliveries.isNotEmpty) 'delivery': deliveries,
      if (payments.isNotEmpty) 'payment': payments,
      if (q != null && q.isNotEmpty) 'q': q,
      if (sort != null) 'sort': sort,
      'page': '$page',
    };
    final qs = Uri(queryParameters: params).query;
    return request('GET', '/api/listings?$qs');
  }

  Future<Map<String, dynamic>> compounds() => request('GET', '/api/compounds');

  /// The discover payload: counters, newest units, top compounds and areas.
  ///
  /// Built by the same server function the website's home page calls, so the app and the
  /// site can never quote different numbers for the same marketplace.
  Future<Map<String, dynamic>> home() => request('GET', '/api/home');

  /// Full public detail for one listing: the three prices and the price history.
  /// Accepts the cuid or the human reference.
  Future<Map<String, dynamic>> listingDetail(String idOrReference) =>
      request('GET', '/api/listings/$idOrReference');

  // --- Offers, deals, viewings, messages ----------------------------------
  //
  // The transaction spine. Every rule these hit is enforced on the server; the app's
  // copies in models/offer.dart only decide what to grey out.

  Future<Map<String, dynamic>> offers() => request('GET', '/api/offers');

  Future<Map<String, dynamic>> makeOffer({
    required String listingId,
    required double amount,
    String? message,
    String? paymentType,
    DateTime? expiresAt,
  }) => request(
    'POST',
    '/api/offers',
    body: {
      'listingId': listingId,
      'amount': amount,
      if (message != null && message.isNotEmpty) 'message': message,
      if (paymentType != null) 'paymentType': paymentType,
      if (expiresAt != null) 'expiresAt': expiresAt.toUtc().toIso8601String(),
    },
  );

  /// action: accept | reject | counter | withdraw
  Future<Map<String, dynamic>> respondToOffer(
    String offerId,
    String action, {
    double? amount,
    String? message,
  }) => request(
    'POST',
    '/api/offers/$offerId',
    body: {
      'action': action,
      if (amount != null) 'amount': amount,
      if (message != null && message.isNotEmpty) 'message': message,
    },
  );

  // Unit trading (src/lib/trade.ts). The server enforces every rule; the app's copy of
  // the cash-direction rule (models/trade.dart) only decides which choices to show.

  Future<Map<String, dynamic>> tradeMarket({String? type, String? areaSlug}) {
    final q = <String>[
      if (type != null) 'type=${Uri.encodeQueryComponent(type)}',
      if (areaSlug != null) 'area=${Uri.encodeQueryComponent(areaSlug)}',
    ].join('&');
    return request('GET', '/api/trade/market${q.isEmpty ? '' : '?$q'}');
  }

  Future<Map<String, dynamic>> tradeUnitsFor(String targetListingId) =>
      request('GET', '/api/trade/units?target=${Uri.encodeQueryComponent(targetListingId)}');

  Future<Map<String, dynamic>> tradeMatches() => request('GET', '/api/trade/matches');

  Future<Map<String, dynamic>> tradeOffers() => request('GET', '/api/trade-offers');

  Future<Map<String, dynamic>> makeTradeOffer({
    required String targetListingId,
    required List<String> unitListingIds,
    double cashAmount = 0,
    String? cashPayer,
  }) => request(
    'POST',
    '/api/trade-offers',
    body: {
      'targetListingId': targetListingId,
      'unitListingIds': unitListingIds,
      'cashAmount': cashAmount,
      if (cashAmount > 0 && cashPayer != null) 'cashPayer': cashPayer,
    },
  );

  /// action: accept | reject (recipient) | withdraw (proposer)
  Future<Map<String, dynamic>> respondToTradeOffer(String id, String action) =>
      request('POST', '/api/trade-offers/$id', body: {'action': action});

  // Trade requests — "the unit I want in exchange", asked with the browse filters
  // (src/lib/tradeRequest.ts). Body: types, areaIds, compoundIds, bedrooms, bathrooms,
  // payment, minPrice, maxPrice, description, listingId (the own unit offered, which the
  // server opens to trade). Saving answers with every unit open to trade that fits.

  Future<Map<String, dynamic>> tradeRequests() => request('GET', '/api/trade/requests');

  /// `{request, matches}`.
  Future<Map<String, dynamic>> tradeRequest(String id) => request('GET', '/api/trade/requests/$id');

  /// Creates (id null) or replaces a request. Answers `{id, matches}`.
  Future<Map<String, dynamic>> saveTradeRequest(String? id, Map<String, dynamic> body) =>
      id == null ? request('POST', '/api/trade/requests', body: body) : request('PUT', '/api/trade/requests/$id', body: body);

  /// Pause or resume match notifications.
  Future<Map<String, dynamic>> setTradeRequestActive(String id, bool active) =>
      request('PATCH', '/api/trade/requests/$id', body: {'active': active});

  Future<Map<String, dynamic>> deleteTradeRequest(String id) => request('DELETE', '/api/trade/requests/$id');

  // In-app notifications (/dashboard/notifications on the website).

  /// `{unread, notifications: [...]}`, newest first.
  Future<Map<String, dynamic>> notifications() => request('GET', '/api/notifications');

  Future<Map<String, dynamic>> readAllNotifications() => request('POST', '/api/notifications/read-all');

  /// Marks one notification read. The endpoint answers with a redirect to what the
  /// notification points at (for the website's links); the app does not follow it — it
  /// routes from the notification's `href` itself — so any status below 400 is success.
  Future<void> openNotification(String id) async {
    Future<int> send() async {
      final req = http.Request('GET', Uri.parse('$baseUrl/api/notifications/$id/open'))
        ..followRedirects = false
        ..headers.addAll(_headers);
      final res = await req.send().timeout(const Duration(seconds: 30));
      await res.stream.drain<void>();
      return res.statusCode;
    }

    try {
      var status = await send();
      if (status == 401 && _refreshToken != null && await _refresh()) status = await send();
      if (status >= 400) throw ApiException('request_failed', status: status);
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('network_error');
    }
  }

  Future<Map<String, dynamic>> tradeSettings() => request('GET', '/api/trade/settings');

  Future<Map<String, dynamic>> saveTradeSettings(
    String listingId, {
    required bool openToTrade,
    required Map<String, dynamic> preference,
  }) => request(
    'PUT',
    '/api/listings/$listingId/trade',
    body: {'openToTrade': openToTrade, 'preference': preference},
  );

  // Saved listings (the heart). Same endpoint the website's heart uses.
  Future<Map<String, dynamic>> savedIds() => request('GET', '/api/saved?ids=1');
  Future<Map<String, dynamic>> savedListings() => request('GET', '/api/saved');
  Future<Map<String, dynamic>> saveListing(String listingId) =>
      request('POST', '/api/saved', body: {'listingId': listingId});
  Future<Map<String, dynamic>> unsaveListing(String listingId) =>
      request('DELETE', '/api/saved?listingId=${Uri.encodeQueryComponent(listingId)}');

  /// The owner's own listings with status, counts and (for drafts) the publish gate.
  Future<Map<String, dynamic>> myListings() => request('GET', '/api/listings/mine');

  /// Account settings — the same PATCH the website's settings form uses.
  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> fields) =>
      request('PATCH', '/api/auth/me', body: fields);

  Future<Map<String, dynamic>> deals() => request('GET', '/api/deals');

  Future<Map<String, dynamic>> dealDetail(String reference) =>
      request('GET', '/api/deals/$reference');

  Future<Map<String, dynamic>> reserveDeal(String reference) =>
      request('POST', '/api/deals/$reference/reserve');

  Future<Map<String, dynamic>> viewings() => request('GET', '/api/viewings');

  /// Each slot is a day + one of the three daily windows; the server resolves Cairo time.
  Future<Map<String, dynamic>> requestViewing(
    String listingId,
    List<SlotPick> slots,
  ) => request(
    'POST',
    '/api/viewings',
    body: {
      'listingId': listingId,
      'slots': slots.map((s) => s.toJson()).toList(),
    },
  );

  /// action: accept | decline | propose | confirm | cancel
  Future<Map<String, dynamic>> respondToViewing(
    String id,
    String action, {
    DateTime? at,
  }) => request(
    'POST',
    '/api/viewings/$id',
    body: {
      'action': action,
      if (at != null) 'at': at.toUtc().toIso8601String(),
    },
  );

  Future<Map<String, dynamic>> conversations() =>
      request('GET', '/api/conversations');

  /// Opens (or reuses) the thread on a listing, optionally with a first question.
  Future<Map<String, dynamic>> messages(String conversationId) =>
      request('GET', '/api/conversations/$conversationId/messages');

  Future<Map<String, dynamic>> sendMessage(
    String conversationId,
    String body,
  ) => request(
    'POST',
    '/api/conversations/$conversationId/messages',
    body: {'body': body},
  );

  // --- Requests -----------------------------------------------------------

  Future<Map<String, dynamic>> myRequests() => request('GET', '/api/requests');

  Future<Map<String, dynamic>> createUnitRequest(
    String listingId,
    Map<String, dynamic> profile,
  ) => request(
    'POST',
    '/api/requests',
    body: {'type': 'unit', 'listingId': listingId, 'profile': profile},
  );

  Future<Map<String, dynamic>> createOpenRequest(
    Map<String, dynamic> profile,
  ) => request(
    'POST',
    '/api/requests',
    body: {'type': 'open', 'profile': profile},
  );

  Future<Map<String, dynamic>> report(
    String listingId,
    String reason, {
    String? detail,
  }) => request(
    'POST',
    '/api/reports',
    body: {'listingId': listingId, 'reason': reason, 'detail': detail},
  );

  // --- Owner flow ---------------------------------------------------------

  Future<Map<String, dynamic>> createDraft(Map<String, dynamic> unit) =>
      request('POST', '/api/listings/draft', body: unit);

  /// Edits a draft (or rejected) listing. The server takes only listing fields here
  /// (price, withoutOver, titles, descriptions, installment), never the unit itself.
  /// A draft's own photos (owner only): `{media: [{id, room, source, thumbUrl, url, ...}]}`.
  Future<Map<String, dynamic>> listingMedia(String listingId) =>
      request('GET', '/api/listings/$listingId/media');

  Future<Map<String, dynamic>> updateDraft(String listingId, Map<String, dynamic> fields) =>
      request('PATCH', '/api/listings/$listingId', body: fields);

  /// Uploads a photo taken with the in-app camera — the BYTES, not a device path. The
  /// server resizes it, strips EXIF, keeps the original private, and judges the GPS.
  /// Returns `{created, demoted}`; `demoted` = the GPS was missing or too far from the unit.
  Future<Map<String, dynamic>> uploadListingPhoto(
    String listingId, {
    required List<int> bytes,
    required String filename,
    required String room,
    double? gpsLat,
    double? gpsLng,
    DateTime? capturedAt,
  }) => _multipart('/api/listings/$listingId/media/upload', fields: {
    'room': room,
    if (gpsLat != null) 'gpsLat': '$gpsLat',
    if (gpsLng != null) 'gpsLng': '$gpsLng',
    'capturedAt': (capturedAt ?? DateTime.now()).toUtc().toIso8601String(),
  }, file: http.MultipartFile.fromBytes('file', bytes, filename: filename, contentType: _jpegOrPng(filename)));

  /// The unit's ownership document, photographed in the app. The server reads it (Claude
  /// vision) and cross-checks it against what the owner typed.
  Future<Map<String, dynamic>> uploadOwnershipDoc(
    String listingId, {
    required String type,
    required List<({String mediaType, String data})> images,
  }) => request('POST', '/api/listings/$listingId/ownership-doc', body: {
    'type': type,
    'fileKey': 'docs/$listingId/$type-${DateTime.now().millisecondsSinceEpoch}',
    'images': [for (final i in images) {'mediaType': i.mediaType, 'data': i.data}],
  });

  /// Identity (KYC level 1): ID front, ID back, selfie. The national ID number is hashed
  /// by the server and never stored.
  Future<Map<String, dynamic>> uploadIdentity({
    required String type,
    required String nationalId,
    required List<({String mediaType, String data})> images,
  }) => request('POST', '/api/kyc/identity', body: {
    'type': type,
    'nationalId': nationalId,
    'fileKey': 'kyc/$type-${DateTime.now().millisecondsSinceEpoch}',
    'images': [for (final i in images) {'mediaType': i.mediaType, 'data': i.data}],
  });

  // --- Virtual tours ---------------------------------------------------------

  /// Tours on a listing: approved ones for everyone; the owner and staff also get pending
  /// and rejected ones with their status.
  Future<Map<String, dynamic>> listingTours(String listingId) => request('GET', '/api/listings/$listingId/tours');

  /// A YouTube / Vimeo / Matterport / Kuula link. Owner-added tours wait for review.
  Future<Map<String, dynamic>> addTourLink(String listingId, {required String url, String? title}) =>
      request('POST', '/api/listings/$listingId/tours', body: {'url': url, if (title != null && title.isNotEmpty) 'title': title});

  /// An uploaded walkthrough video (MP4 / MOV, ≤ 200 MB). The server strips its metadata.
  Future<Map<String, dynamic>> uploadTourVideo(String listingId, {required List<int> bytes, required String filename, String? title}) =>
      _multipart('/api/listings/$listingId/tours',
          fields: {if (title != null && title.isNotEmpty) 'title': title},
          file: http.MultipartFile.fromBytes('file', bytes,
              filename: filename,
              contentType: filename.toLowerCase().endsWith('.mov') ? MediaType('video', 'quicktime') : MediaType('video', 'mp4')),
          // A large video on a phone connection takes minutes, not seconds.
          timeout: const Duration(minutes: 15));

  /// The owner's professional photography + 360° tour shoot for a listing:
  /// { booking, last, fee, bookable }.
  Future<Map<String, dynamic>> tourBooking(String listingId) => request('GET', '/api/listings/$listingId/tour-booking');

  /// Book a shoot at a preferred day + Cairo window ("11-14" | "14-18" | "18-21").
  Future<Map<String, dynamic>> bookTourShoot(String listingId, {required String date, required String window, String? note}) =>
      request('POST', '/api/listings/$listingId/tour-booking', body: {
        'slot': {'date': date, 'window': window},
        if (note != null && note.isNotEmpty) 'note': note,
      });

  Future<Map<String, dynamic>> cancelTourShoot(String listingId) => request('DELETE', '/api/listings/$listingId/tour-booking');

  Future<Map<String, dynamic>> deleteTour(String listingId, String tourId) =>
      request('DELETE', '/api/listings/$listingId/tours/$tourId');

  static MediaType _jpegOrPng(String filename) =>
      filename.toLowerCase().endsWith('.png') ? MediaType('image', 'png') : MediaType('image', 'jpeg');

  /// multipart/form-data with the same auth and one-shot token refresh as [request].
  Future<Map<String, dynamic>> _multipart(
    String path, {
    required Map<String, String> fields,
    required http.MultipartFile file,
    bool retryOnUnauthorized = true,
    Duration timeout = const Duration(seconds: 60),
  }) async {
    // A MultipartFile can be sent once: the retry after a token refresh used to call
    // finalize() on the already-sent file and throw a StateError instead of retrying. So
    // read the bytes first and send a fresh copy each time.
    final List<int> bytes;
    try {
      bytes = await file.finalize().toBytes();
    } catch (_) {
      throw ApiException('file_unreadable');
    }
    http.MultipartFile copy() =>
        http.MultipartFile.fromBytes(file.field, bytes, filename: file.filename, contentType: file.contentType);
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'))
      ..fields.addAll(fields)
      ..files.add(copy());
    if (_accessToken != null) req.headers['Authorization'] = 'Bearer $_accessToken';
    http.Response res;
    try {
      res = await http.Response.fromStream(await req.send()).timeout(timeout);
    } catch (_) {
      throw ApiException('network_error');
    }
    if (res.statusCode == 401 && retryOnUnauthorized && _refreshToken != null && await _refresh()) {
      return _multipart(path,
          fields: fields,
          file: copy(),
          retryOnUnauthorized: false,
          timeout: timeout);
    }
    Map<String, dynamic> json;
    try {
      json = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('bad_response', status: res.statusCode);
    }
    if (res.statusCode >= 400) {
      throw ApiException(json['error']?.toString() ?? 'request_failed', status: res.statusCode, body: json);
    }
    return json;
  }

  Future<Map<String, dynamic>> validateListing(String listingId) =>
      request('GET', '/api/listings/$listingId/validate');

  Future<Map<String, dynamic>> submitListing(String listingId) =>
      request('POST', '/api/listings/$listingId/submit');
}
