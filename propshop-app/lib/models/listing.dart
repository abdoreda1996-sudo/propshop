import '../services/lang.dart';

/// Mirrors the ListingCardVM the web API returns, so the two clients render the same
/// facts from the same payload.
class ListingCard {
  ListingCard({
    required this.id,
    required this.reference,
    required this.titleAr,
    required this.titleEn,
    required this.price,
    required this.currency,
    required this.purpose,
    this.withoutOver = false,
    required this.paymentType,
    required this.photo,
    this.photos = const [],
    required this.photoCount,
    this.tourCount = 0,
    required this.compoundAr,
    required this.compoundEn,
    required this.areaAr,
    required this.areaEn,
    required this.type,
    required this.bedrooms,
    required this.bathrooms,
    required this.sizeSqm,
    required this.finishing,
    required this.deliveryStatus,
    required this.trustLevel,
    required this.status,
    required this.daysOnMarket,
    required this.fairLow,
    required this.fairMid,
    required this.fairHigh,
    required this.fairConfidence,
    required this.verdict,
  });

  final String id;
  final String reference;
  final String titleAr;
  final String titleEn;
  final double price;
  final String currency;
  final String purpose;

  /// "بدون أوفر": offered at the original contract price.
  final bool withoutOver;
  final String paymentType;

  /// The cover photo the owner chose, not simply the first one captured.
  final String? photo;

  /// Up to 8 thumbnails, cover first, so the card can be swiped through without opening
  /// the listing. Falls back to [photo] alone when the server sends no list.
  final List<String> photos;

  /// Total photos on the listing, for the "+N" affordance on the card.
  final int photoCount;

  /// Approved virtual tours — the card shows a "video tour" badge when > 0.
  final int tourCount;

  final String? compoundAr;
  final String? compoundEn;
  final String areaAr;
  final String areaEn;
  final String type;
  final int bedrooms;
  final int bathrooms;
  final double sizeSqm;
  final String finishing;
  final String deliveryStatus;
  final int trustLevel;

  /// live|reserved|sold. Anything but "live" disables offers and viewings.
  final String status;

  final int daysOnMarket;
  final double? fairLow;
  final double? fairMid;
  final double? fairHigh;
  final String? fairConfidence;

  /// "below" | "fair" | "above" | "unknown"
  final String verdict;

  String placeAr() => compoundAr ?? areaAr;
  String placeEn() => compoundEn ?? areaEn;

  /// Title and place in the app's current language, falling back to Arabic when the
  /// English copy is empty.
  String get title => isEn && titleEn.isNotEmpty ? titleEn : titleAr;
  String place() {
    final en = placeEn();
    return isEn && en.isNotEmpty ? en : placeAr();
  }

  static double _d(dynamic v) => v == null ? 0 : (v as num).toDouble();
  static int _i(dynamic v) => v == null ? 0 : (v as num).toInt();

  factory ListingCard.fromJson(Map<String, dynamic> j) {
    final fair = j['fair'] as Map<String, dynamic>?;
    final cover = j['photo'] as String?;
    final photos = [
      for (final p in ((j['photos'] as List?) ?? const []))
        if (p is String && p.isNotEmpty) p,
    ];
    return ListingCard(
      id: j['id'] as String,
      reference: j['reference'] as String,
      titleAr: (j['titleAr'] ?? '') as String,
      titleEn: (j['titleEn'] ?? '') as String,
      price: _d(j['price']),
      currency: (j['currency'] ?? 'EGP') as String,
      purpose: (j['purpose'] ?? 'sale') as String,
      withoutOver: j['withoutOver'] == true,
      paymentType: (j['paymentType'] ?? 'cash') as String,
      photo: j['photo'] as String?,
      photos: photos.isNotEmpty || cover == null ? photos : [cover],
      photoCount: _i(j['photoCount']),
      tourCount: _i(j['tourCount']),
      compoundAr: j['compoundAr'] as String?,
      compoundEn: j['compoundEn'] as String?,
      areaAr: (j['areaAr'] ?? '') as String,
      areaEn: (j['areaEn'] ?? '') as String,
      type: (j['type'] ?? 'apartment') as String,
      bedrooms: _i(j['bedrooms']),
      bathrooms: _i(j['bathrooms']),
      sizeSqm: _d(j['sizeSqm']),
      finishing: (j['finishing'] ?? '') as String,
      deliveryStatus: (j['deliveryStatus'] ?? 'ready') as String,
      trustLevel: _i(j['trustLevel']),
      status: (j['status'] ?? 'live') as String,
      daysOnMarket: _i(j['daysOnMarket']),
      fairLow: fair == null ? null : _d(fair['low']),
      fairMid: fair == null ? null : _d(fair['mid']),
      fairHigh: fair == null ? null : _d(fair['high']),
      fairConfidence: fair?['confidence'] as String?,
      verdict: (j['verdict'] ?? 'unknown') as String,
    );
  }
}

class BuyerRequest {
  BuyerRequest({
    required this.id,
    required this.reference,
    required this.type,
    required this.status,
    required this.slaDueAt,
    required this.firstResponseAt,
    required this.slaBreachedAt,
    required this.listingTitleAr,
    required this.listingTitleEn,
    required this.advisorName,
    required this.createdAt,
  });

  final String id;
  final String reference;
  final String type;
  final String status;
  final DateTime slaDueAt;
  final DateTime? firstResponseAt;
  final DateTime? slaBreachedAt;
  final String? listingTitleAr;
  final String? listingTitleEn;
  final String? advisorName;
  final DateTime createdAt;

  String? get listingTitle => isEn && (listingTitleEn ?? '').isNotEmpty
      ? listingTitleEn
      : listingTitleAr;

  static DateTime? _dt(dynamic v) =>
      v == null ? null : DateTime.tryParse(v as String)?.toLocal();

  factory BuyerRequest.fromJson(Map<String, dynamic> j) {
    final listing = j['listing'] as Map<String, dynamic>?;
    final advisor = j['assignedAdvisor'] as Map<String, dynamic>?;
    return BuyerRequest(
      id: j['id'] as String,
      reference: j['reference'] as String,
      type: (j['type'] ?? 'unit') as String,
      status: (j['status'] ?? 'received') as String,
      slaDueAt: _dt(j['slaDueAt']) ?? DateTime.now(),
      firstResponseAt: _dt(j['firstResponseAt']),
      slaBreachedAt: _dt(j['slaBreachedAt']),
      listingTitleAr: listing?['titleAr'] as String?,
      listingTitleEn: listing?['titleEn'] as String?,
      advisorName: advisor?['fullName'] as String?,
      createdAt: _dt(j['createdAt']) ?? DateTime.now(),
    );
  }

  /// Mirrors slaState() in the web app: the clock stops at the first human response.
  Duration get remaining =>
      slaDueAt.difference(firstResponseAt ?? DateTime.now());
  bool get breached => firstResponseAt == null && remaining.isNegative;
  bool get urgent =>
      firstResponseAt == null && !breached && remaining.inHours < 4;
}
