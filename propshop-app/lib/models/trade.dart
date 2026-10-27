import '../services/lang.dart';
import 'listing.dart';

/// Unit trading — the app's twin of src/lib/trade.ts.
///
/// The app duplicates exactly ONE server rule: which way cash may flow given the owner's
/// stated term (`allowedPayers`), so the offer sheet never offers a direction the server
/// refuses. test/trade_test.dart pins it against the server's table.

double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int? _iN(Object? v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
double? _dN(Object? v) => v == null ? null : _d(v);

const kMaxTradeUnits = 3;

/// Owner's cash term → who may pay the difference ("proposer" = the one offering).
List<String> allowedPayers(String cashTerm) {
  switch (cashTerm) {
    case 'none':
      return const [];
    case 'i_receive': // the owner receives, so the proposer pays
      return const ['proposer'];
    case 'i_pay': // the owner pays
      return const ['recipient'];
    default:
      return const ['proposer', 'recipient'];
  }
}

String cashTermLabel(String c) => switch (c) {
  'i_pay' => tr('المالك ممكن يدفع فرق', 'Owner can pay a difference'),
  'i_receive' => tr('المالك عايز ياخد فرق', 'Owner wants to receive a difference'),
  'none' => tr('من غير فلوس', 'No cash'),
  _ => tr('فرق فلوس في أي اتجاه', 'Cash either way'),
};

class TradeArea {
  const TradeArea({required this.id, required this.nameAr, required this.nameEn});
  final String id;
  final String nameAr;
  final String nameEn;
  String get name => isEn ? nameEn : nameAr;
  factory TradeArea.fromJson(Map<String, dynamic> j) => TradeArea(
    id: j['id'] as String,
    nameAr: (j['nameAr'] ?? '') as String,
    nameEn: (j['nameEn'] ?? '') as String,
  );
}

/// What an owner wants in return. Every criterion optional; empty list = any.
class TradeWants {
  const TradeWants({
    this.types = const [],
    this.areaIds = const [],
    this.areas = const [],
    this.minBedrooms,
    this.minSizeSqm,
    this.minValue,
    this.maxValue,
    this.cash = 'either',
    this.note,
  });
  final List<String> types;
  final List<String> areaIds;
  final List<TradeArea> areas;
  final int? minBedrooms;
  final double? minSizeSqm;
  final double? minValue;
  final double? maxValue;
  final String cash;
  final String? note;

  bool get isOpenToAnything =>
      types.isEmpty && areaIds.isEmpty && minBedrooms == null && minSizeSqm == null;

  factory TradeWants.fromJson(Map<String, dynamic> j) => TradeWants(
    types: ((j['types'] as List?) ?? const []).cast<String>(),
    areaIds: ((j['areaIds'] as List?) ?? const []).cast<String>(),
    areas: ((j['areas'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(TradeArea.fromJson)
        .toList(),
    minBedrooms: _iN(j['minBedrooms']),
    minSizeSqm: _dN(j['minSizeSqm']),
    minValue: _dN(j['minValue']),
    maxValue: _dN(j['maxValue']),
    cash: (j['cash'] ?? 'either') as String,
    note: j['note'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'types': types,
    'areaIds': areaIds,
    'minBedrooms': minBedrooms,
    'minSizeSqm': minSizeSqm,
    'minValue': minValue,
    'maxValue': maxValue,
    'cash': cash,
    'note': note,
  };
}

/// A unit in a trade: one of mine in the picker, or one side of an offer.
class TradeUnit {
  const TradeUnit({
    required this.id,
    required this.reference,
    required this.titleAr,
    required this.titleEn,
    required this.price,
    required this.currency,
    this.photo,
    this.matches = false,
  });
  final String id;
  final String reference;
  final String titleAr;
  final String titleEn;
  final double price;
  final String currency;
  final String? photo;

  /// Fits the target owner's requirements on its own (picker only).
  final bool matches;

  String get title {
    final t = isEn ? titleEn : titleAr;
    return t.isNotEmpty ? t : reference;
  }

  factory TradeUnit.fromJson(Map<String, dynamic> j) => TradeUnit(
    id: j['id'] as String,
    reference: j['reference'] as String,
    titleAr: (j['titleAr'] ?? '') as String,
    titleEn: (j['titleEn'] ?? '') as String,
    price: _d(j['price']),
    currency: (j['currency'] ?? 'EGP') as String,
    photo: j['photo'] as String?,
    matches: j['matches'] == true,
  );
}

class TradeOffer {
  const TradeOffer({
    required this.id,
    required this.reference,
    required this.role,
    required this.status,
    required this.live,
    required this.cashAmount,
    required this.target,
    required this.units,
    required this.expiresAt,
    required this.createdAt,
    this.cashPayer,
    this.stage,
    this.cancelReason,
    this.counterpartyName,
    this.counterpartyPhone,
    this.myFee,
  });
  final String id;
  final String reference;
  final String role; // proposer | recipient
  final String status; // pending|accepted|rejected|withdrawn|expired|cancelled
  final bool live;
  final double cashAmount;
  final String? cashPayer;
  final String? stage;
  final String? cancelReason;
  final TradeUnit target;
  final List<TradeUnit> units;
  final DateTime expiresAt;
  final DateTime createdAt;
  final String? counterpartyName;
  final String? counterpartyPhone;

  /// My own success fee, fixed by the server at acceptance (by the unit type I receive).
  /// Per side only — the pair is never shown. Null before acceptance.
  final double? myFee;

  bool get iProposed => role == 'proposer';
  bool get needsMyReply => live && !iProposed;

  /// True when I am the one paying the cash difference.
  bool get iPayCash => cashAmount > 0 && (cashPayer == 'proposer') == iProposed;

  factory TradeOffer.fromJson(Map<String, dynamic> j) {
    final cp = j['counterparty'] as Map<String, dynamic>?;
    return TradeOffer(
      id: j['id'] as String,
      reference: j['reference'] as String,
      role: j['role'] as String,
      status: j['status'] as String,
      live: j['live'] == true,
      cashAmount: _d(j['cashAmount']),
      cashPayer: j['cashPayer'] as String?,
      stage: j['stage'] as String?,
      cancelReason: j['cancelReason'] as String?,
      target: TradeUnit.fromJson(j['target'] as Map<String, dynamic>),
      units: ((j['units'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(TradeUnit.fromJson)
          .toList(),
      expiresAt: DateTime.parse(j['expiresAt'] as String),
      createdAt: DateTime.parse(j['createdAt'] as String),
      counterpartyName: cp?['name'] as String?,
      counterpartyPhone: cp?['phone'] as String?,
      myFee: _dN(j['myFee']),
    );
  }
}

String tradeStatusLabel(String s) => switch (s) {
  'pending' => tr('مستني رد', 'Awaiting reply'),
  'accepted' => tr('اتقبلت', 'Accepted'),
  'rejected' => tr('اترفضت', 'Declined'),
  'withdrawn' => tr('اتسحبت', 'Withdrawn'),
  'expired' => tr('انتهت مدتها', 'Expired'),
  'cancelled' => tr('اتلغت', 'Cancelled'),
  _ => s,
};

String tradeStageLabel(String s) => switch (s) {
  'agreed' => tr('اتفقوا', 'Agreed'),
  'documents' => tr('المستندات اتراجعت', 'Documents checked'),
  'contracts' => tr('العقود اتمضت', 'Contracts signed'),
  'completed' => tr('المقايضة تمت', 'Completed'),
  _ => s,
};

class TradeMatch {
  const TradeMatch({required this.perfect, required this.listing, required this.myUnitReference});
  final bool perfect;
  final TradeUnit listing;
  final String myUnitReference;
  factory TradeMatch.fromJson(Map<String, dynamic> j) => TradeMatch(
    perfect: j['perfect'] == true,
    listing: TradeUnit.fromJson(j['listing'] as Map<String, dynamic>),
    myUnitReference: (j['myUnit'] as Map<String, dynamic>)['reference'] as String,
  );
}

class TradeMarketItem {
  const TradeMarketItem({required this.card, required this.wants, required this.isMine, required this.youHaveAMatch});
  final ListingCard card;
  final TradeWants wants;
  final bool isMine;
  final bool youHaveAMatch;
  factory TradeMarketItem.fromJson(Map<String, dynamic> j) => TradeMarketItem(
    card: ListingCard.fromJson(j['card'] as Map<String, dynamic>),
    wants: TradeWants.fromJson(j['wants'] as Map<String, dynamic>),
    isMine: j['isMine'] == true,
    youHaveAMatch: j['youHaveAMatch'] == true,
  );
}

/// One of my listings in the trade settings list.
class MyTradeListing {
  const MyTradeListing({
    required this.id,
    required this.reference,
    required this.titleAr,
    required this.titleEn,
    required this.status,
    required this.visible,
    required this.openToTrade,
    required this.preference,
  });
  final String id;
  final String reference;
  final String titleAr;
  final String titleEn;
  final String status;
  final bool visible;
  final bool openToTrade;
  final TradeWants preference;
  String get title {
    final t = isEn ? titleEn : titleAr;
    return t.isNotEmpty ? t : reference;
  }

  factory MyTradeListing.fromJson(Map<String, dynamic> j) => MyTradeListing(
    id: j['id'] as String,
    reference: j['reference'] as String,
    titleAr: (j['titleAr'] ?? '') as String,
    titleEn: (j['titleEn'] ?? '') as String,
    status: j['status'] as String,
    visible: j['visible'] == true,
    openToTrade: j['openToTrade'] == true,
    preference: TradeWants.fromJson(j['preference'] as Map<String, dynamic>),
  );
}

String tradeErrorText(String code) => switch (code) {
  'units_required' => tr('اختار وحدة واحدة على الأقل من وحداتك.', 'Choose at least one of your units.'),
  'too_many_units' => tr('أقصى عدد 3 وحدات في العرض.', 'At most 3 units per offer.'),
  'cash_payer_required' => tr('حدد مين هيدفع الفرق.', 'Say who pays the difference.'),
  'cash_not_accepted' => tr('المالك عايز مقايضة من غير فلوس.', 'The owner wants a swap with no cash.'),
  'cash_direction_refused' => tr('المالك محدد مين يدفع الفرق، والعرض ده عكس اللي هو عايزه.', 'The owner set who pays the difference, and this offer has it the other way round.'),
  'not_open_to_trade' => tr('الوحدة دي مش متاحة للمقايضة دلوقتي.', 'This unit is not open to trade right now.'),
  'unit_not_eligible' => tr('وحداتك لازم تكون منشورة وموثّقة ومش محجوزة.', 'Your units must be live, verified and not reserved.'),
  'already_offered' => tr('عندك عرض مقايضة شغال على الوحدة دي بالفعل.', 'You already have a live trade offer on this unit.'),
  'units_unavailable' => tr('واحدة من الوحدات اتحجزت أو اتقفلت.', 'One of the units has been reserved or closed.'),
  'not_live' => tr('العرض ده خلص.', 'This offer is no longer live.'),
  'listing_closed' => tr('الوحدة محجوزة أو اتقفلت.', 'This unit is reserved or closed.'),
  'invalid_fields' => tr('راجع الأرقام، في رقم مش مظبوط.', 'Check the numbers. One of them is not valid.'),
  'unauthorized' => tr('سجّل دخولك الأول.', 'Sign in first.'),
  'not_found' => tr('مش لاقيين ده، يمكن اتمسح.', 'We could not find that. It may have been deleted.'),
  'network_error' => tr('مش قادرين نوصل للسيرفر. اتأكد من الإنترنت.', "We can't reach the server. Check your connection."),
  _ => tr('حصلت مشكلة. حاول تاني.', 'Something went wrong. Try again.'),
};
