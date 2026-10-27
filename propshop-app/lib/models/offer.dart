library;

import '../services/lang.dart';

/// Offers and negotiations — the Dart mirror of propshop-web/src/lib/offers.ts.
///
/// The server is always the authority: it re-checks every rule before it writes. These
/// copies exist so the app can grey out an impossible button instead of letting the user
/// press it and read an error, and so a lapsed offer looks lapsed without a round trip.
///
/// Keep the two in step. The rules duplicated here are: whose turn it is, and when an
/// offer stops being live.

enum OfferSide { buyer, seller }

OfferSide sideFrom(String raw) =>
    raw == 'seller' ? OfferSide.seller : OfferSide.buyer;

class OfferStep {
  const OfferStep({
    required this.id,
    required this.direction,
    required this.amount,
    required this.status,
    required this.message,
    required this.expiresAt,
    required this.createdAt,
  });

  final String id;
  final OfferSide direction;
  final double amount;

  /// pending|accepted|rejected|withdrawn|countered|expired
  final String status;
  final String? message;
  final DateTime? expiresAt;
  final DateTime createdAt;

  /// Mirrors isLive() on the server: expiry is evaluated now, never trusted from the
  /// status alone. An offer past its deadline is dead even if no sweep has run.
  bool get isLive {
    if (status != 'pending') return false;
    if (expiresAt != null && !expiresAt!.isAfter(DateTime.now())) return false;
    return true;
  }

  /// The status to show, folding a lapsed deadline into "expired".
  String get effectiveStatus {
    if (status == 'pending' &&
        expiresAt != null &&
        !expiresAt!.isAfter(DateTime.now())) {
      return 'expired';
    }
    return status;
  }

  factory OfferStep.fromJson(Map<String, dynamic> j) => OfferStep(
    id: j['id'] as String,
    direction: sideFrom((j['direction'] ?? 'buyer') as String),
    amount: (j['amount'] as num?)?.toDouble() ?? 0,
    status: (j['status'] ?? 'pending') as String,
    message: j['message'] as String?,
    expiresAt: j['expiresAt'] == null
        ? null
        : DateTime.tryParse(j['expiresAt'] as String)?.toLocal(),
    createdAt:
        DateTime.tryParse((j['createdAt'] ?? '') as String)?.toLocal() ??
        DateTime.now(),
  );
}

/// One negotiation: every step between one buyer and one listing, oldest first.
class OfferChain {
  const OfferChain({
    required this.listingId,
    required this.reference,
    required this.titleAr,
    this.titleEn,
    required this.askingPrice,
    required this.currency,
    required this.listingStatus,
    required this.role,
    required this.status,
    required this.awaiting,
    required this.latestAmount,
    required this.counterparty,
    required this.steps,
  });

  final String listingId;
  final String reference;
  final String titleAr;
  final String? titleEn;
  final double askingPrice;

  /// The listing title in the current language, falling back to Arabic.
  String get title => isEn && (titleEn ?? '').isNotEmpty ? titleEn! : titleAr;
  final String currency;
  final String listingStatus;

  /// Which side the signed-in user is on.
  final OfferSide role;

  /// The chain's overall status.
  final String status;

  /// Whose move it is, or null when settled.
  final OfferSide? awaiting;

  final double latestAmount;
  final PublicIdentity counterparty;
  final List<OfferStep> steps;

  /// True when the signed-in user is the one who has to act.
  bool get myMove => awaiting != null && awaiting == role;

  OfferStep? get liveStep {
    for (final s in steps) {
      if (s.isLive) return s;
    }
    return null;
  }

  factory OfferChain.fromJson(Map<String, dynamic> j) {
    final listing = (j['listing'] ?? const {}) as Map<String, dynamic>;
    final awaitingRaw = j['awaiting'] as String?;
    return OfferChain(
      listingId: (listing['id'] ?? '') as String,
      reference: (listing['reference'] ?? '') as String,
      titleAr: (listing['titleAr'] ?? listing['reference'] ?? '') as String,
      titleEn: listing['titleEn'] as String?,
      askingPrice: (listing['price'] as num?)?.toDouble() ?? 0,
      currency: (listing['currency'] ?? 'EGP') as String,
      listingStatus: (listing['status'] ?? 'live') as String,
      role: sideFrom((j['role'] ?? 'buyer') as String),
      status: (j['status'] ?? 'pending') as String,
      awaiting: awaitingRaw == null ? null : sideFrom(awaitingRaw),
      latestAmount: (j['latestAmount'] as num?)?.toDouble() ?? 0,
      counterparty: PublicIdentity.fromJson(
        (j['counterparty'] ?? const {}) as Map<String, dynamic>,
      ),
      steps: ((j['steps'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(OfferStep.fromJson)
          .toList(),
    );
  }
}

/// What one side may know about the other — mirrors src/lib/identity.ts.
///
/// There is deliberately no name, phone or email field: the app cannot render what it is
/// never given, and the server never sends it before a viewing is confirmed.
class PublicIdentity {
  const PublicIdentity({
    required this.ref,
    required this.side,
    required this.memberSince,
    required this.identityVerified,
    required this.fundsVerified,
    required this.ownershipVerified,
  });

  final int? ref;
  final OfferSide side;
  final int memberSince;
  final bool identityVerified;
  final bool fundsVerified;
  final bool ownershipVerified;

  /// "مشتري موثق #4821" / "مالك موثق #1010".
  String get label {
    final tag = ref == null ? '' : ' #$ref';
    return side == OfferSide.buyer
        ? tr('مشتري موثق$tag', 'Verified buyer$tag')
        : tr('مالك موثق$tag', 'Verified owner$tag');
  }

  factory PublicIdentity.fromJson(Map<String, dynamic> j) => PublicIdentity(
    ref: (j['ref'] as num?)?.toInt(),
    side: sideFrom((j['side'] ?? 'seller') as String),
    memberSince: (j['memberSince'] as num?)?.toInt() ?? DateTime.now().year,
    identityVerified: j['identityVerified'] == true,
    fundsVerified: j['fundsVerified'] == true,
    ownershipVerified: j['ownershipVerified'] == true,
  );
}

/// Arabic copy for each chain status.
const Map<String, String> kOfferStatusAr = {
  'pending': 'مستني رد',
  'accepted': 'اتقبل',
  'rejected': 'اترفض',
  'withdrawn': 'اتسحب',
  'countered': 'فيه رد بسعر تاني',
  'expired': 'انتهت مدته',
};

const Map<String, String> kOfferStatusEn = {
  'pending': 'Awaiting reply',
  'accepted': 'Accepted',
  'rejected': 'Rejected',
  'withdrawn': 'Withdrawn',
  'countered': 'Countered',
  'expired': 'Expired',
};

/// A chain status in the current language.
String offerStatusLabel(String status) =>
    (isEn ? kOfferStatusEn : kOfferStatusAr)[status] ?? status;
