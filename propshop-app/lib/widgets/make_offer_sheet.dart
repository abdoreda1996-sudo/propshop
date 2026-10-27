import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import 'filter_controls.dart';

/// MAKE AN OFFER (Section 8), the app's twin of MakeOfferButton.tsx.
///
/// One number, everything else collapsed. No free-text message: buyers and sellers do not
/// text each other through the app. A buyer arrives knowing
/// what they want to pay; each extra required field between them and sending it costs
/// offers.
///
/// Returns true when an offer was sent, so the caller can refresh.
Future<bool?> showMakeOfferSheet(
  BuildContext context, {
  required String listingId,
  required double price,
  required String currency,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: _MakeOfferSheet(
        listingId: listingId,
        price: price,
        currency: currency,
      ),
    ),
  );
}

class _MakeOfferSheet extends StatefulWidget {
  const _MakeOfferSheet({
    required this.listingId,
    required this.price,
    required this.currency,
  });
  final String listingId;
  final double price;
  final String currency;

  @override
  State<_MakeOfferSheet> createState() => _MakeOfferSheetState();
}

class _MakeOfferSheetState extends State<_MakeOfferSheet> {
  final _amount = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  bool _showTerms = false;
  int _expiryDays = 7;
  String _paymentType = 'cash';
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  double get _value => (parseAmount(_amount.text) ?? 0).toDouble();
  bool get _aboveAsk => _value > widget.price;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().makeOffer(
        listingId: widget.listingId,
        amount: _value,
        paymentType: _paymentType,
        expiresAt: DateTime.now().add(Duration(days: _expiryDays)),
      );
      if (!mounted) return;
      setState(() => _sent = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      // The server sends human copy; prefer it to a code.
      setState(
        () => _error =
            (e.body?[isEn ? 'messageEn' : 'messageAr'] as String?) ??
            tr(
              'مش قادرين نبعت العرض دلوقتي.',
              "We couldn't send your offer right now.",
            ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_sent) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                tr('عرضك وصل للمالك', 'Your offer reached the owner'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AqarColors.ink900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                tr(
                  'هتلاقي رد المالك في صفحة العروض. ممكن يقبل، يرفض، أو يبعتلك سعر تاني.',
                  "You'll find the owner's reply under Offers. They can accept, reject, or send you a different price.",
                ),
                style: const TextStyle(
                  fontSize: 13.5,
                  height: 1.6,
                  color: AqarColors.ink500,
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: Text(tr('تمام', 'Done')),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final gap = _value > 0
        ? (((widget.price - _value) / widget.price) * 100).round()
        : 0;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tr('قدّم عرضك', 'Make your offer'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              '${tr('السعر المطلوب', 'Asking price')} ${formatPriceExact(widget.price, currency: widget.currency)}',
              style: const TextStyle(fontSize: 13, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
            ),

            const SizedBox(height: 18),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              autofocus: true,
              inputFormatters: [AmountInputFormatter()],
              onChanged: (_) => setState(() {}),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, fontFeatures: AqarType.tnum),
              decoration: InputDecoration(
                labelText: tr('عرضك', 'Your offer'),
                hintText: tr('اكتب عرضك', 'Enter your offer'),
              ),
            ),

            // Live feedback beats a rejection after submitting.
            if (_value > 0 && !_aboveAsk)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  gap > 0
                      ? tr(
                          'أقل من السعر المطلوب بـ $gap٪',
                          '$gap% below the asking price',
                        )
                      : tr('بنفس السعر المطلوب', 'At the asking price'),
                  style: const TextStyle(
                    fontSize: 13,
                    color: AqarColors.textMuted,
                  ),
                ),
              ),
            if (_aboveAsk)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  tr(
                    'ده أعلى من السعر المطلوب. راجع الرقم.',
                    "That's above the asking price. Check the number.",
                  ),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AqarColors.danger,
                  ),
                ),
              ),

            const SizedBox(height: 6),
            // Progressive disclosure: most buyers never open this.
            TextButton(
              onPressed: () => setState(() => _showTerms = !_showTerms),
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              child: Text(
                _showTerms
                    ? tr('إخفاء التفاصيل', 'Hide details')
                    : tr(
                        'تفاصيل إضافية (مدة العرض، طريقة الدفع)',
                        'More details (offer validity, payment method)',
                      ),
              ),
            ),

            if (_showTerms) ...[
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _expiryDays,
                      decoration: InputDecoration(
                        labelText: tr('العرض ساري لمدة', 'Offer valid for'),
                      ),
                      items: [
                        DropdownMenuItem(
                          value: 3,
                          child: Text(tr('3 أيام', '3 days')),
                        ),
                        DropdownMenuItem(
                          value: 7,
                          child: Text(tr('7 أيام', '7 days')),
                        ),
                        DropdownMenuItem(
                          value: 14,
                          child: Text(tr('14 يوم', '14 days')),
                        ),
                      ],
                      onChanged: (v) => setState(() => _expiryDays = v ?? 7),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _paymentType,
                      decoration: InputDecoration(
                        labelText: tr('طريقة الدفع', 'Payment method'),
                      ),
                      items: [
                        DropdownMenuItem(
                          value: 'cash',
                          child: Text(tr('كاش', 'Cash')),
                        ),
                        DropdownMenuItem(
                          value: 'installments',
                          child: Text(tr('تقسيط', 'Instalments')),
                        ),
                      ],
                      onChanged: (v) =>
                          setState(() => _paymentType = v ?? 'cash'),
                    ),
                  ),
                ],
              ),
            ],

            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AqarColors.dangerBg,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AqarColors.danger,
                  ),
                ),
              ),
            ],

            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: (_busy || _value <= 0 || _aboveAsk)
                    ? null
                    : _submit,
                child: Text(
                  _busy
                      ? tr('جاري…', 'Sending…')
                      : tr('ابعت العرض', 'Send offer'),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              tr(
                'العرض مش ملزم قانوناً. المالك يقدر يقبل أو يرفض أو يبعتلك سعر تاني.',
                'An offer is not legally binding. The owner can accept, reject, or send you a different price.',
              ),
              style: const TextStyle(
                fontSize: 11.5,
                height: 1.6,
                color: AqarColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
