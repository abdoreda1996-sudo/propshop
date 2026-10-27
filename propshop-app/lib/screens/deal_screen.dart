import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/deal.dart';
import '../models/offer.dart';
import '../services/api.dart';
import '../services/fees.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';

/// The Deal Room (Section 11), the app's twin of /deal/[reference].
///
/// One screen answering: what did we agree, where are we, what happens next. Sections
/// are separated by hairlines and space, not stacked cards.
class DealScreen extends StatefulWidget {
  const DealScreen({super.key, required this.reference});
  final String reference;

  @override
  State<DealScreen> createState() => _DealScreenState();
}

class _DealScreenState extends State<DealScreen> {
  Deal? _deal;
  bool _providerPending = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final json = await context.read<Api>().dealDetail(widget.reference);
      if (!mounted) return;
      setState(() {
        _deal = Deal.fromJson(json);
        _providerPending = json['providerPending'] == true;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.status == 404
            ? tr('الصفقة دي مش متاحة لك.', "This deal isn't available to you.")
            : tr('مش قادرين نحمّل الصفقة دلوقتي.', "We couldn't load this deal right now."),
      );
    }
  }

  Future<void> _reserve() async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ReserveSheet(price: _deal!.agreedPrice, providerPending: _providerPending),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await context.read<Api>().reserveDeal(widget.reference);
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      final msg = (e.body?[isEn ? 'messageEn' : 'messageAr'] as String?) ??
          tr('مش قادرين نكمل الحجز.', "We couldn't complete the reservation.");
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _deal;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.reference, style: const TextStyle(fontFeatures: AqarType.tnum)),
        actions: const [LangToggleButton()],
      ),
      // The spinner only before the first load: a pull-to-refresh keeps the page on
      // screen instead of blanking it.
      body: d == null
          ? (_error != null
              ? ErrorNotice(message: _error!, onRetry: _load)
              : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(onRefresh: _load, child: _body(d)),
    );
  }

  static const _h = TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900);

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [Text(title, style: _h), const SizedBox(height: 12), ...children],
        ),
      );

  Widget _body(Deal d) {
    final hold = d.holdRemaining;
    final steps = dealTimeline(d.stage);
    final meta = [d.listingReference, if (d.counterparty != null) d.counterparty!.label].join(' · ');

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
      children: [
        // --- Summary -------------------------------------------------------
        Text(
          d.title,
          style: const TextStyle(fontSize: 20, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900),
        ),
        const SizedBox(height: 4),
        Text(meta, style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500, fontFeatures: AqarType.tnum)),
        const SizedBox(height: 18),
        Text(tr('السعر المتفق عليه', 'Agreed price'), style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500)),
        const SizedBox(height: 2),
        Text(formatPriceExact(d.agreedPrice, currency: d.currency), style: AqarType.figure(size: 26)),
        if (hold != null && hold > Duration.zero) ...[
          const SizedBox(height: 8),
          Text(
            '${tr('الوحدة محجوزة،', 'Unit reserved,')} ${formatCountdown(hold)}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.accent600, fontFeatures: AqarType.tnum),
          ),
        ],
        if (d.fee.buyer > 0 || d.fee.seller > 0) ...[
          const SizedBox(height: 18),
          _FeePanel(fee: d.fee, role: d.role, currency: d.currency),
        ],
        const SizedBox(height: 20),
        const Divider(),

        // --- Next action ---------------------------------------------------
        _section(tr('الخطوة الجاية', 'Next step'), [
          if (d.stage == 'offer_accepted' && d.role == OfferSide.buyer) ...[
            Text(
              tr(
                'ادفع مقدم الحجز عشان الوحدة تتقفل باسمك وتبدأ مراجعة المستندات.',
                'Pay the reservation deposit so the unit is held in your name and the document review starts.',
              ),
              style: const TextStyle(fontSize: 13.5, height: 1.6, color: AqarColors.ink700),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : _reserve,
                child: Text(tr('احجز الوحدة', 'Reserve the unit')),
              ),
            ),
          ] else if (d.stage == 'offer_accepted')
            Text(
              tr(
                'مستنيين المشتري يدفع مقدم الحجز. الوحدة اتشالت من البحث ومش بتستقبل عروض تانية.',
                'Waiting for the buyer to pay the reservation deposit. The unit is out of search and takes no other offers.',
              ),
              style: const TextStyle(fontSize: 13.5, height: 1.6, color: AqarColors.ink700),
            )
          else
            Text(stageExplainer(d.stage), style: const TextStyle(fontSize: 13.5, height: 1.6, color: AqarColors.ink700)),
          if (_providerPending) ...[
            const SizedBox(height: 12),
            Text(
              tr(
                'بروب شوب مابتمسكش فلوسك. الدفع بيتم عن طريق جهة دفع مرخّصة، والربط معاها لسه بيتعمل، فمفيش أي مبلغ بيتحصّل دلوقتي.',
                'PropShop never holds your money. Payment runs through a licensed provider; that link is still being built, so nothing is collected yet.',
              ),
              style: const TextStyle(fontSize: 12, height: 1.6, color: AqarColors.ink500),
            ),
          ],
        ]),
        const Divider(),

        // --- Timeline ------------------------------------------------------
        _section(tr('مراحل الصفقة', 'Deal stages'), [
          for (var i = 0; i < steps.length; i++) _timelineRow(steps[i], i == steps.length - 1),
        ]),

        // --- Documents -----------------------------------------------------
        if (d.checklist.isNotEmpty) ...[
          const Divider(),
          _section(tr('المستندات', 'Documents'), [
            for (final item in d.checklist)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Status, so the icon stays: done or still missing.
                    Icon(
                      item.done ? Icons.check : Icons.remove,
                      size: 16,
                      color: item.done ? AqarColors.ok700 : AqarColors.ink400,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        item.label,
                        style: TextStyle(fontSize: 13.5, color: item.done ? AqarColors.ink900 : AqarColors.ink500),
                      ),
                    ),
                  ],
                ),
              ),
          ]),
        ],

        // --- Counterparty --------------------------------------------------
        if (d.counterparty != null) ...[
          const Divider(),
          _counterparty(d),
        ],

        if (d.events.isNotEmpty) ...[
          const Divider(),
          _section(tr('السجل', 'History'), [
            for (final e in d.events)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(e.label, style: const TextStyle(fontSize: 13.5))),
                    const SizedBox(width: 12),
                    Text(
                      formatDate(e.at),
                      style: const TextStyle(fontSize: 12, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
                    ),
                  ],
                ),
              ),
          ]),
        ],
      ],
    );
  }

  /// A vertical rail: a filled dot for done, a ringed dot for the current stage, a grey
  /// dot for what is still ahead.
  Widget _timelineRow(TimelineStep s, bool isLast) {
    final done = s.state == DealStepState.done;
    final current = s.state == DealStepState.current;
    final dot = Container(
      width: 11,
      height: 11,
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done ? AqarColors.ok700 : (current ? Colors.white : AqarColors.ink200),
        border: current ? Border.all(color: AqarColors.brand500, width: 3) : null,
      ),
    );

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 11,
            child: Column(
              children: [
                dot,
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      color: done ? AqarColors.ok700 : AqarColors.ink200,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(
                current ? '${s.label} (${tr('دلوقتي', 'now')})' : s.label,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.35,
                  fontWeight: s.state == DealStepState.upcoming ? FontWeight.w400 : FontWeight.w600,
                  color: s.state == DealStepState.upcoming ? AqarColors.ink500 : AqarColors.ink900,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _counterparty(Deal d) {
    final cp = d.counterparty!;
    final checks = [
      if (cp.identityVerified) tr('الهوية موثقة', 'identity verified'),
      if (cp.ownershipVerified) tr('الملكية موثقة', 'ownership verified'),
      if (cp.fundsVerified) tr('القدرة المالية موثقة', 'funds verified'),
    ];
    return _section(d.role == OfferSide.buyer ? tr('المالك', 'Owner') : tr('المشتري', 'Buyer'), [
      Text(cp.label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
      const SizedBox(height: 4),
      Text(
        [
          ...checks,
          tr('عضو من ${cp.memberSince}', 'member since ${cp.memberSince}'),
        ].join(isEn ? ', ' : '، '),
        style: const TextStyle(fontSize: 13, height: 1.5, color: AqarColors.ok700),
      ),
      const SizedBox(height: 10),
      Text(
        tr(
          'الأسماء وأرقام التليفون مابتظهرش. كل التواصل بيتم من خلال المنصة لحد ما تتفقوا على المعاينة.',
          'Names and phone numbers stay hidden. All contact goes through the platform until you agree on a viewing.',
        ),
        style: const TextStyle(fontSize: 12, height: 1.6, color: AqarColors.ink500),
      ),
    ]);
  }
}

/// What each side owes, on the screen where they decide whether to proceed.
///
/// Shows BOTH halves, including the other side's, to both parties. The point of a
/// published fee is that neither party has to wonder what the other was quoted; hiding
/// the counterparty's half would reintroduce exactly the asymmetry this product removes.
///
/// The figures come from the server already split; nothing here recomputes them.
class _FeePanel extends StatelessWidget {
  const _FeePanel({required this.fee, required this.role, required this.currency});

  final FeeShares fee;
  final OfferSide role;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final myRole = role == OfferSide.seller ? 'seller' : 'buyer';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Per side only; the whole-deal total is never shown (owner, 2026-09-27).
        Text(
          tr('رسم إتمام الصفقة على كل طرف', 'Completion fee, per side'),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.ink900),
        ),
        const SizedBox(height: 6),
        for (final party in const ['buyer', 'seller'])
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    party == myRole ? '${feePartyLabel(party)} ${tr('(إنت)', '(you)')}' : feePartyLabel(party),
                    style: TextStyle(
                      fontSize: 13.5,
                      color: party == myRole ? AqarColors.ink900 : AqarColors.ink500,
                      fontWeight: party == myRole ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ),
                Text(
                  formatPriceExact(party == 'seller' ? fee.seller : fee.buyer, currency: currency),
                  style: AqarType.figure(size: 14, weight: party == myRole ? FontWeight.w700 : FontWeight.w500),
                ),
              ],
            ),
          ),
        const SizedBox(height: 6),
        Text(
          tr(
            'رسم ثابت حسب نوع الوحدة، وكل طرف بيدفعه لوحده. بيتدفع لما الصفقة تتم بس، ومش نسبة من السعر، ومفيش عمولة من أي طرف.',
            'A fixed fee set by unit type, paid by each side separately. It is due only when the deal completes, it is not a percentage of the price, and there is no commission from either side.',
          ),
          style: const TextStyle(fontSize: 12, height: 1.6, color: AqarColors.ink500),
        ),
      ],
    );
  }
}

/// The reservation sheet. Amount, hold length and refund rule appear BEFORE the button:
/// those are what a buyer is owed before parting with money.
class _ReserveSheet extends StatelessWidget {
  const _ReserveSheet({required this.price, required this.providerPending});
  final double price;
  final bool providerPending;

  @override
  Widget build(BuildContext context) {
    final deposit = (price * 0.01).clamp(25000, 250000).roundToDouble();

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('حجز الوحدة', 'Reserve the unit'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            _Row(tr('مقدم الحجز', 'Reservation deposit'), formatPriceExact(deposit)),
            _Row(tr('مدة الحجز', 'Hold period'), tr('48 ساعة', '48 hours')),
            _Row(tr('بيترد؟', 'Refundable?'), tr('أيوه، لو المستندات مامرّتش', "Yes, if the documents don't pass")),
            const SizedBox(height: 14),
            Text(
              tr(
                'الوحدة بتتقفل باسمك ومابتستقبلش عروض تانية طول مدة الحجز.\n'
                    'لو المستندات مامرّتش في المراجعة، المقدم بيرجعلك كامل.\n'
                    'لو رجعت في كلامك بعد ما المستندات تعدي، المقدم مابيرجعش.',
                'The unit is held in your name and takes no other offers for the whole hold period.\n'
                    "If the documents don't pass review, the deposit is refunded in full.\n"
                    'If you back out after the documents pass, the deposit is not refunded.',
              ),
              style: const TextStyle(fontSize: 12.5, height: 1.8, color: AqarColors.ink700),
            ),
            if (providerPending) ...[
              const SizedBox(height: 14),
              Text(
                tr(
                  'مهم: الربط بجهة الدفع المرخّصة لسه ماخلصش. الزرار ده بيسجّل إنك عايز تحجز ويقفل الوحدة، ومش بيسحب أي فلوس دلوقتي.',
                  'Important: the licensed payment provider is not connected yet. This button records that you want to reserve and locks the unit; it does not take any money now.',
                ),
                style: const TextStyle(fontSize: 12, height: 1.6, color: AqarColors.ink500),
              ),
            ],
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: Text(tr('أكّد الحجز', 'Confirm reservation')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14, color: AqarColors.ink500))),
          const SizedBox(width: 12),
          // Flexible: "Yes, if the documents don't pass" overflowed a 390px phone.
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, fontFeatures: AqarType.tnum),
            ),
          ),
        ],
      ),
    );
  }
}
