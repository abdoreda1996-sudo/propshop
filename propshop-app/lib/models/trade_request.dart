import '../services/lang.dart';

/// A trade request — "the unit I want in exchange", in the browse filters' terms
/// (web src/lib/tradeRequest.ts TradeRequestSpec). Empty lists mean "any".
class TradeRequestSpec {
  const TradeRequestSpec({
    this.types = const [],
    this.areaIds = const [],
    this.compoundIds = const [],
    this.bedrooms = const [],
    this.bathrooms = const [],
    this.payment = const [],
    this.minPrice,
    this.maxPrice,
    this.description,
  });

  final List<String> types, areaIds, compoundIds;

  /// Bedroom facet values: "0" studio … "5" = 5 or more.
  final List<String> bedrooms;

  /// Bathroom facet values: "1" … "4" = 4 or more.
  final List<String> bathrooms;
  final List<String> payment;
  final double? minPrice, maxPrice;
  final String? description;

  static List<String> _list(dynamic v) => ((v as List?) ?? const []).map((e) => '$e').toList();
  static double? _num(dynamic v) => v == null ? null : (v as num).toDouble();

  factory TradeRequestSpec.fromJson(Map<String, dynamic> j) => TradeRequestSpec(
        types: _list(j['types']),
        areaIds: _list(j['areaIds']),
        compoundIds: _list(j['compoundIds']),
        bedrooms: _list(j['bedrooms']),
        bathrooms: _list(j['bathrooms']),
        payment: _list(j['payment']),
        minPrice: _num(j['minPrice']),
        maxPrice: _num(j['maxPrice']),
        description: j['description'] as String?,
      );
}

class TradeRequest {
  const TradeRequest({required this.id, required this.active, required this.listingId, required this.createdAt, required this.spec});

  final String id;

  /// False = match notifications paused.
  final bool active;

  /// The requester's own listing offered in exchange, if they named one.
  final String? listingId;
  final DateTime createdAt;
  final TradeRequestSpec spec;

  factory TradeRequest.fromJson(Map<String, dynamic> j) => TradeRequest(
        id: j['id'] as String,
        active: j['active'] != false,
        listingId: j['listingId'] as String?,
        createdAt: DateTime.tryParse('${j['createdAt']}')?.toLocal() ?? DateTime.now(),
        spec: TradeRequestSpec.fromJson(j),
      );
}

/// A unit open to trade that fits a request (web tradeRequestApi.ts matchView).
class TradeRequestMatch {
  const TradeRequestMatch({
    required this.id,
    required this.reference,
    required this.titleAr,
    required this.titleEn,
    required this.price,
    required this.currency,
    required this.type,
    required this.bedrooms,
    required this.bathrooms,
    required this.sizeSqm,
    required this.placeAr,
    required this.placeEn,
    required this.photo,
  });

  final String id, reference, titleAr, titleEn, currency, type;
  final double price, sizeSqm;
  final int bedrooms, bathrooms;
  final String placeAr, placeEn;
  final String? photo;

  String get title {
    final t = isEn && titleEn.isNotEmpty ? titleEn : titleAr;
    return t.isEmpty ? reference : t;
  }

  String get place => isEn && placeEn.isNotEmpty ? placeEn : placeAr;

  factory TradeRequestMatch.fromJson(Map<String, dynamic> j) {
    final area = (j['area'] as Map?)?.cast<String, dynamic>() ?? const {};
    final compound = (j['compound'] as Map?)?.cast<String, dynamic>();
    return TradeRequestMatch(
      id: j['id'] as String,
      reference: (j['reference'] ?? '') as String,
      titleAr: (j['titleAr'] ?? '') as String,
      titleEn: (j['titleEn'] ?? '') as String,
      price: ((j['price'] as num?) ?? 0).toDouble(),
      currency: (j['currency'] ?? 'EGP') as String,
      type: (j['type'] ?? '') as String,
      bedrooms: ((j['bedrooms'] as num?) ?? 0).toInt(),
      bathrooms: ((j['bathrooms'] as num?) ?? 0).toInt(),
      sizeSqm: ((j['sizeSqm'] as num?) ?? 0).toDouble(),
      placeAr: (compound?['nameAr'] ?? area['nameAr'] ?? '') as String,
      placeEn: (compound?['nameEn'] ?? area['nameEn'] ?? '') as String,
      photo: j['photo'] as String?,
    );
  }
}

/// One in-app notification (GET /api/notifications).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.titleAr,
    required this.titleEn,
    required this.bodyAr,
    required this.bodyEn,
    required this.href,
    required this.read,
    required this.createdAt,
  });

  final String id, kind, titleAr, titleEn;
  final String? bodyAr, bodyEn, href;
  final bool read;
  final DateTime createdAt;

  String get title => isEn && titleEn.isNotEmpty ? titleEn : titleAr;
  String? get body => isEn && (bodyEn ?? '').isNotEmpty ? bodyEn : bodyAr;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        kind: (j['kind'] ?? '') as String,
        titleAr: (j['titleAr'] ?? '') as String,
        titleEn: (j['titleEn'] ?? '') as String,
        bodyAr: j['bodyAr'] as String?,
        bodyEn: j['bodyEn'] as String?,
        href: j['href'] as String?,
        read: j['readAt'] != null,
        createdAt: DateTime.tryParse('${j['createdAt']}')?.toLocal() ?? DateTime.now(),
      );
}
