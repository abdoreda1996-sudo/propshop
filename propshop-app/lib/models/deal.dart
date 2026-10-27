import '../services/format.dart';
import '../services/viewing_slots.dart';
import 'offer.dart';
import '../services/fees.dart';
import '../services/lang.dart';

// Deals, viewings and threads — the Dart mirror of propshop-web/src/lib/deals.ts.
//
// The stage list and its copy are duplicated so the timeline renders without a round
// trip. The server owns the transitions; nothing here decides what is allowed.

const List<String> kDealPath = [
  'offer_accepted',
  'reserved',
  'due_diligence',
  'contract_signing',
  'transfer',
  'completed',
];

const Map<String, String> kStageLabelAr = {
  'offer_accepted': 'العرض اتقبل',
  'reserved': 'الوحدة اتحجزت',
  'due_diligence': 'مراجعة المستندات',
  'contract_signing': 'توقيع العقد',
  'transfer': 'نقل الملكية',
  'completed': 'تمت الصفقة',
  'cancelled': 'اتلغت',
};

const Map<String, String> kStageLabelEn = {
  'offer_accepted': 'Offer accepted',
  'reserved': 'Unit reserved',
  'due_diligence': 'Document review',
  'contract_signing': 'Contract signing',
  'transfer': 'Ownership transfer',
  'completed': 'Deal completed',
  'cancelled': 'Cancelled',
};

/// A stage's label in the current language.
String stageLabel(String stage) =>
    (isEn ? kStageLabelEn : kStageLabelAr)[stage] ?? stage;

const Map<String, String> kStageExplainerAr = {
  'offer_accepted':
      'اتفقتوا على السعر. الخطوة الجاية إن المشتري يدفع مقدم الحجز عشان الوحدة تتقفل باسمه.',
  'reserved': 'الوحدة محجوزة ومش بتستقبل عروض تانية. دلوقتي بنراجع المستندات.',
  'due_diligence':
      'بنتأكد من سلسلة الملكية ومستحقات المطور والصيانة قبل أي توقيع.',
  'contract_signing': 'العقد جاهز للتوقيع من الطرفين.',
  'transfer': 'إجراءات نقل الملكية شغالة مع المطور/الشهر العقاري.',
  'completed': 'الصفقة اكتملت ونقل الملكية تم.',
  'cancelled': 'الصفقة اتلغت.',
};

const Map<String, String> kStageExplainerEn = {
  'offer_accepted':
      'You agreed on the price. Next, the buyer pays the reservation deposit so the unit is held in their name.',
  'reserved':
      'The unit is reserved and no longer takes other offers. We are now reviewing the documents.',
  'due_diligence':
      'We check the ownership chain, developer dues and maintenance before anything is signed.',
  'contract_signing': 'The contract is ready for both sides to sign.',
  'transfer':
      'The ownership transfer is under way with the developer / real-estate registry.',
  'completed': 'The deal is complete and ownership has been transferred.',
  'cancelled': 'The deal was cancelled.',
};

/// A stage's one-line explainer in the current language.
String stageExplainer(String stage) =>
    (isEn ? kStageExplainerEn : kStageExplainerAr)[stage] ?? '';

enum DealStepState { done, current, upcoming }

class TimelineStep {
  const TimelineStep(this.stage, this.label, this.state);
  final String stage;
  final String label;
  final DealStepState state;
}

/// Mirrors timeline() on the server: position, not a percentage.
List<TimelineStep> dealTimeline(String stage) {
  if (stage == 'cancelled') {
    return [
      TimelineStep('cancelled', stageLabel('cancelled'), DealStepState.current),
    ];
  }
  final found = kDealPath.indexOf(stage);
  final at = found == -1 ? 0 : found;
  return [
    for (var i = 0; i < kDealPath.length; i++)
      TimelineStep(
        kDealPath[i],
        stageLabel(kDealPath[i]),
        i < at
            ? DealStepState.done
            : (i == at ? DealStepState.current : DealStepState.upcoming),
      ),
  ];
}

class Deal {
  const Deal({
    required this.reference,
    required this.listingReference,
    required this.titleAr,
    this.titleEn,
    required this.currency,
    required this.agreedPrice,
    required this.fee,
    required this.stage,
    required this.role,
    required this.reservedUntil,
    required this.counterparty,
    required this.checklist,
    required this.events,
  });

  final String reference;
  final String listingReference;
  final String titleAr;
  final String? titleEn;
  final String currency;
  final double agreedPrice;

  /// The listing title in the current language, falling back to Arabic.
  String get title => isEn && (titleEn ?? '').isNotEmpty ? titleEn! : titleAr;

  /// The completion fee and each side's half, as split by the SERVER.
  ///
  /// Not computed on the device: this is a figure someone will be invoiced for, and a
  /// rounding rule duplicated in Dart and TypeScript is one that eventually diverges.
  /// `lib/services/fees.dart` exists only for screens where no deal exists yet.
  final FeeShares fee;

  final String stage;
  final OfferSide role;
  final DateTime? reservedUntil;
  final PublicIdentity? counterparty;
  final List<ChecklistItem> checklist;
  final List<DealEvent> events;

  /// How far along the happy path, as done/total steps.
  (int, int) get progress {
    final i = kDealPath.indexOf(stage);
    return (i == -1 ? 0 : i, kDealPath.length - 1);
  }

  /// Remaining reservation hold, or null when there is none.
  Duration? get holdRemaining {
    if (reservedUntil == null) return null;
    final d = reservedUntil!.difference(DateTime.now());
    return d.isNegative ? Duration.zero : d;
  }

  factory Deal.fromJson(Map<String, dynamic> j) => Deal(
    reference: (j['reference'] ?? '') as String,
    listingReference: (j['listingReference'] ?? '') as String,
    titleAr: (j['title'] ?? '') as String,
    titleEn: j['titleEn'] as String?,
    currency: (j['currency'] ?? 'EGP') as String,
    agreedPrice: (j['agreedPrice'] as num?)?.toDouble() ?? 0,
    // An older server that does not send `fee` yields zero shares rather than a
    // crash; the deal screen then omits the panel instead of showing "0 ج.م".
    fee: _feeFrom(j['fee']),
    stage: (j['stage'] ?? 'offer_accepted') as String,
    role: sideFrom((j['role'] ?? 'buyer') as String),
    reservedUntil: j['reservedUntil'] == null
        ? null
        : DateTime.tryParse(j['reservedUntil'] as String)?.toLocal(),
    counterparty: j['counterparty'] == null
        ? null
        : PublicIdentity.fromJson(j['counterparty'] as Map<String, dynamic>),
    checklist: ((j['checklist'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ChecklistItem.fromJson)
        .toList(),
    events: ((j['events'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(DealEvent.fromJson)
        .toList(),
  );
}

/// Read the server's split, tolerating its absence.
FeeShares _feeFrom(Object? raw) {
  if (raw is! Map<String, dynamic>) {
    return const FeeShares(total: 0, buyer: 0, seller: 0);
  }
  return FeeShares(
    // The server sends only the per-side figures; the total is never shown.
    total:
        ((raw['buyer'] as num?)?.toDouble() ?? 0) +
        ((raw['seller'] as num?)?.toDouble() ?? 0),
    buyer: (raw['buyer'] as num?)?.toDouble() ?? 0,
    seller: (raw['seller'] as num?)?.toDouble() ?? 0,
  );
}

class ChecklistItem {
  const ChecklistItem({
    required this.key,
    required this.labelAr,
    this.labelEn,
    required this.done,
  });
  final String key;
  final String labelAr;
  final String? labelEn;
  final bool done;

  String get label => isEn && (labelEn ?? '').isNotEmpty ? labelEn! : labelAr;

  factory ChecklistItem.fromJson(Map<String, dynamic> j) => ChecklistItem(
    key: (j['key'] ?? '') as String,
    labelAr: (j['labelAr'] ?? j['label'] ?? j['key'] ?? '') as String,
    labelEn: (j['labelEn'] ?? j['label']) as String?,
    done: j['done'] == true,
  );
}

class DealEvent {
  const DealEvent({
    required this.event,
    required this.labelAr,
    this.labelEn,
    required this.at,
  });
  final String event;
  final String labelAr;
  final String? labelEn;
  final DateTime at;

  String get label => isEn && (labelEn ?? '').isNotEmpty ? labelEn! : labelAr;

  factory DealEvent.fromJson(Map<String, dynamic> j) => DealEvent(
    event: (j['event'] ?? '') as String,
    labelAr: (j['label'] ?? j['event'] ?? '') as String,
    labelEn: j['labelEn'] as String?,
    at:
        DateTime.tryParse((j['createdAt'] ?? '') as String)?.toLocal() ??
        DateTime.now(),
  );
}

/// A viewing request (Section 12).
class Viewing {
  const Viewing({
    required this.id,
    required this.reference,
    required this.titleAr,
    this.titleEn,
    required this.role,
    required this.status,
    required this.slots,
    required this.proposedAt,
    required this.scheduledAt,
    this.slotViews = const [],
    this.proposedView,
    this.scheduledView,
  });

  final String id;
  final String reference;
  final String titleAr;
  final String? titleEn;
  final OfferSide role;

  String get title => isEn && (titleEn ?? '').isNotEmpty ? titleEn! : titleAr;

  /// requested|proposed|accepted|declined|cancelled|completed
  final String status;
  final List<DateTime> slots;
  final DateTime? proposedAt;
  final DateTime? scheduledAt;

  /// Server-described labels (Cairo day + 12-hour window), parallel to [slots].
  final List<SlotView> slotViews;
  final SlotView? proposedView;
  final SlotView? scheduledView;

  /// The label for the i-th slot, falling back to a local 12-hour time for old rows.
  String slotLabel(int i) =>
      i < slotViews.length ? slotViews[i].label : formatDateTime(slots[i]);
  String? get proposedLabel =>
      proposedView?.label ??
      (proposedAt == null ? null : formatDateTime(proposedAt!));
  String? get scheduledLabel =>
      scheduledView?.label ??
      (scheduledAt == null ? null : formatDateTime(scheduledAt!));

  bool get isOpen => !['declined', 'cancelled', 'completed'].contains(status);

  factory Viewing.fromJson(Map<String, dynamic> j) {
    final listing = (j['listing'] ?? const {}) as Map<String, dynamic>;
    return Viewing(
      id: j['id'] as String,
      reference: (listing['reference'] ?? '') as String,
      titleAr: (listing['titleAr'] ?? listing['reference'] ?? '') as String,
      titleEn: listing['titleEn'] as String?,
      role: (j['role'] ?? 'buyer') == 'seller'
          ? OfferSide.seller
          : OfferSide.buyer,
      status: (j['status'] ?? 'requested') as String,
      slots: ((j['slots'] as List?) ?? const [])
          .map((s) => DateTime.tryParse(s as String)?.toLocal())
          .whereType<DateTime>()
          .toList(),
      proposedAt: j['proposedAt'] == null
          ? null
          : DateTime.tryParse(j['proposedAt'] as String)?.toLocal(),
      scheduledAt: j['scheduledAt'] == null
          ? null
          : DateTime.tryParse(j['scheduledAt'] as String)?.toLocal(),
      slotViews: ((j['slotViews'] as List?) ?? const [])
          .map(SlotView.fromJson)
          .whereType<SlotView>()
          .toList(),
      proposedView: SlotView.fromJson(j['proposedView']),
      scheduledView: SlotView.fromJson(j['scheduledView']),
    );
  }
}

const Map<String, String> kViewingStatusAr = {
  'requested': 'مستني رد',
  'proposed': 'ميعاد مقترح',
  'accepted': 'متأكد',
  'declined': 'اترفض',
  'cancelled': 'اتلغى',
  'completed': 'تمت',
};

const Map<String, String> kViewingStatusEn = {
  'requested': 'Awaiting reply',
  'proposed': 'Time proposed',
  'accepted': 'Confirmed',
  'declined': 'Declined',
  'cancelled': 'Cancelled',
  'completed': 'Done',
};

/// A viewing status in the current language.
String viewingStatusLabel(String status) =>
    (isEn ? kViewingStatusEn : kViewingStatusAr)[status] ?? status;

/// A masked conversation in the list.
class Thread {
  const Thread({
    required this.id,
    required this.reference,
    required this.titleAr,
    this.titleEn,
    required this.counterparty,
    required this.preview,
    required this.contactUnlocked,
    this.unread = 0,
  });

  /// Messages in this thread the other side sent that I have not read (server-counted).
  final int unread;

  final String id;
  final String reference;
  final String titleAr;
  final String? titleEn;
  final PublicIdentity counterparty;

  String get title => isEn && (titleEn ?? '').isNotEmpty ? titleEn! : titleAr;
  final String? preview;

  /// True only after a viewing has been confirmed.
  final bool contactUnlocked;

  factory Thread.fromJson(Map<String, dynamic> j) {
    final listing = (j['listing'] ?? const {}) as Map<String, dynamic>;
    final cp = (j['counterparty'] ?? const {}) as Map<String, dynamic>;
    final last = j['lastMessage'] as Map<String, dynamic>?;
    return Thread(
      id: j['id'] as String,
      reference: (listing['reference'] ?? '') as String,
      titleAr: (listing['titleAr'] ?? listing['reference'] ?? '') as String,
      titleEn: listing['titleEn'] as String?,
      counterparty: PublicIdentity.fromJson({
        ...cp,
        'side': (j['role'] ?? 'buyer') == 'owner' ? 'buyer' : 'seller',
      }),
      preview: last?['body'] as String?,
      contactUnlocked: cp['contactUnlocked'] == true,
      unread: (j['unread'] as num?)?.toInt() ?? 0,
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.mine,
    required this.body,
    required this.flagged,
  });
  final String id;
  final bool mine;
  final String body;
  final bool flagged;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
    id: (j['id'] ?? '') as String,
    mine: j['mine'] == true,
    body: (j['body'] ?? '') as String,
    flagged: j['flagged'] == true,
  );
}
