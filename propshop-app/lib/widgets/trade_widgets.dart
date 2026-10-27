import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/trade.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import 'filter_controls.dart' show parseAmount, AmountInputFormatter;

/// "Open to trade" tag: small ink text on a grey ground, like every structural label.
class TradeBadge extends StatelessWidget {
  const TradeBadge({super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AqarColors.navy50,
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(
        tr('متاح للمقايضة', 'Open to trade'),
        style: const TextStyle(fontSize: 11, height: 1.35, fontWeight: FontWeight.w600, color: AqarColors.navy700),
      ),
    );
  }
}

/// What the owner wants in return, as one plain line of facts separated by dots.
/// Mirrors TradeWants in TradePanel.tsx.
class TradeWantsChips extends StatelessWidget {
  const TradeWantsChips({super.key, required this.wants, this.currency = 'EGP'});
  final TradeWants wants;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[
      if (wants.types.isNotEmpty) wants.types.map(unitTypeLabel).join(isEn ? ' or ' : ' أو '),
      if (wants.areas.isNotEmpty) wants.areas.map((a) => a.name).join(isEn ? ' or ' : ' أو '),
      if (wants.minBedrooms != null) tr('${wants.minBedrooms}+ غرف', '${wants.minBedrooms}+ bed'),
      if (wants.minSizeSqm != null) tr('${wants.minSizeSqm!.round()}+ م²', '${wants.minSizeSqm!.round()}+ sqm'),
      if (wants.minValue != null || wants.maxValue != null)
        '${wants.minValue != null ? formatPrice(wants.minValue!, currency: currency) : '…'} – ${wants.maxValue != null ? formatPrice(wants.maxValue!, currency: currency) : '…'}',
      cashTermLabel(wants.cash),
      if (wants.isOpenToAnything) tr('مفتوح لأي عرض', 'Open to any offer'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          parts.join('  ·  '),
          style: const TextStyle(fontSize: 13, height: 1.6, fontWeight: FontWeight.w500, color: AqarColors.ink900, fontFeatures: AqarType.tnum),
        ),
        if (wants.note != null && wants.note!.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(wants.note!, style: const TextStyle(fontSize: 13, height: 1.6, color: AqarColors.ink500)),
        ],
      ],
    );
  }
}

/// OFFER A TRADE, the app's twin of TradeOfferButton.tsx. Pick 1–3 of your verified units,
/// optionally a cash difference in a direction the owner allows. No message box.
/// Returns true when an offer was sent.
Future<bool?> showTradeOfferSheet(BuildContext context, {required String targetListingId}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _TradeOfferSheet(targetListingId: targetListingId),
    ),
  );
}

class _TradeOfferSheet extends StatefulWidget {
  const _TradeOfferSheet({required this.targetListingId});
  final String targetListingId;
  @override
  State<_TradeOfferSheet> createState() => _TradeOfferSheetState();
}

class _TradeOfferSheetState extends State<_TradeOfferSheet> {
  final _cash = TextEditingController();
  List<TradeUnit> _units = const [];
  double _targetPrice = 0;
  String _currency = 'EGP';
  String _cashTerm = 'either';
  final Set<String> _picked = {};
  String? _payer;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _sentRef;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _cash.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final j = await context.read<Api>().tradeUnitsFor(widget.targetListingId);
      final t = j['target'] as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _units = ((j['units'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeUnit.fromJson).toList();
        _targetPrice = (t['price'] as num).toDouble();
        _currency = (t['currency'] ?? 'EGP') as String;
        _cashTerm = (t['cash'] ?? 'either') as String;
        final payers = allowedPayers(_cashTerm);
        _payer = payers.isEmpty ? null : payers.first;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = tradeErrorText(e.code);
        _loading = false;
      });
    } catch (_) {
      // A malformed reply (no target) used to leave the sheet spinning for ever.
      if (!mounted) return;
      setState(() {
        _error = tradeErrorText('');
        _loading = false;
      });
    }
  }

  double get _cashValue => (parseAmount(_cash.text) ?? 0).toDouble();
  double get _offered => _units.where((u) => _picked.contains(u.id)).fold(0.0, (s, u) => s + u.price);

  void _flip(TradeUnit u) => setState(() {
        if (_picked.contains(u.id)) {
          _picked.remove(u.id);
        } else if (_picked.length < kMaxTradeUnits) {
          _picked.add(u.id);
        }
      });

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final j = await context.read<Api>().makeTradeOffer(
        targetListingId: widget.targetListingId,
        unitListingIds: _picked.toList(),
        cashAmount: _cashValue,
        cashPayer: _cashValue > 0 ? _payer : null,
      );
      if (!mounted) return;
      setState(() => _sentRef = j['reference'] as String?);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = tradeErrorText(e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static const _head = TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AqarColors.ink900);
  static const _muted = TextStyle(fontSize: 12.5, height: 1.5, color: AqarColors.ink500);

  @override
  Widget build(BuildContext context) {
    final payers = allowedPayers(_cashTerm);
    final gap = _targetPrice - _offered; // > 0 → my units are worth less
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
        child: _sentRef != null
            ? Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(tr('عرض المقايضة اتبعت', 'Trade offer sent'),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
                    const SizedBox(height: 4),
                    Text(_sentRef!, style: const TextStyle(color: AqarColors.textMuted, fontFeatures: AqarType.tnum)),
                    const SizedBox(height: 8),
                    Text(
                      tr('المالك هيقبل أو يرفض، وهتلاقي العرض في صفحة المقايضة.', 'The owner will accept or decline. You can follow it under Trades.'),
                      style: const TextStyle(color: AqarColors.ink500, height: 1.6),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(tr('تمام', 'Done'))),
                    ),
                  ],
                ),
              )
            : ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
                children: [
                  Text(tr('اعرض مقايضة', 'Offer a trade'),
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
                  const SizedBox(height: 2),
                  Text(tr('اختار لحد 3 وحدات من وحداتك الموثّقة.', 'Choose up to 3 of your verified units.'), style: _muted),
                  const SizedBox(height: 12),
                  if (_loading)
                    const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
                  else if (_units.isEmpty && _error == null)
                    Text(
                      tr(
                        'مفيش عندك وحدات منشورة وموثّقة تقدر تعرضها. اعرض وحدتك الأول، وبعد التوثيق تقدر تقايض بيها.',
                        'You have no live, verified units to offer. List your unit first; once it is verified you can trade with it.',
                      ),
                      style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink700),
                    )
                  else ...[
                    const Divider(),
                    ..._units.map((u) {
                      final on = _picked.contains(u.id);
                      return InkWell(
                        onTap: () => _flip(u),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
                          child: Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: SizedBox(
                                  width: 72,
                                  height: 52,
                                  child: u.photo == null
                                      ? Container(color: AqarColors.ink100)
                                      : CachedNetworkImage(imageUrl: absoluteMediaUrl(u.photo!), fit: BoxFit.cover,
                                          errorWidget: (_, __, ___) => Container(color: AqarColors.ink100)),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(u.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontWeight: FontWeight.w600, color: AqarColors.ink900)),
                                    Text('${u.reference} · ${formatPriceExact(u.price, currency: u.currency)}',
                                        style: const TextStyle(fontSize: 12, color: AqarColors.textMuted, fontFeatures: AqarType.tnum)),
                                    if (u.matches)
                                      Text(tr('بتناسب طلب المالك', "Fits what the owner asked for"),
                                          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AqarColors.ok700)),
                                  ],
                                ),
                              ),
                              Checkbox(value: on, onChanged: (_) => _flip(u)),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 18),
                    Text(tr('فرق الفلوس (اختياري)', 'Cash difference (optional)'), style: _head),
                    if (_picked.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${tr('قيمة وحداتك', 'Your units')} ${formatPriceExact(_offered, currency: _currency)} · ${tr('الوحدة المطلوبة', 'This unit')} ${formatPriceExact(_targetPrice, currency: _currency)}',
                        style: _muted.copyWith(fontFeatures: AqarType.tnum),
                      ),
                      if (gap != 0)
                        Text(
                          gap > 0
                              ? tr('وحداتك أقل بـ ${formatPriceExact(gap, currency: _currency)}، فغالباً إنت اللي هتدفع الفرق.',
                                  'Your units are ${formatPriceExact(gap, currency: _currency)} less, so usually you pay the difference.')
                              : tr('وحداتك أعلى بـ ${formatPriceExact(-gap, currency: _currency)}، فغالباً المالك هو اللي يدفع الفرق.',
                                  'Your units are worth ${formatPriceExact(-gap, currency: _currency)} more, so usually the owner pays the difference.'),
                          style: TextStyle(
                            fontSize: 12.5,
                            height: 1.5,
                            fontWeight: FontWeight.w600,
                            color: gap > 0 ? AqarColors.ink900 : AqarColors.ok700,
                            fontFeatures: AqarType.tnum,
                          ),
                        ),
                    ],
                    if (payers.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(tr('المالك عايز مقايضة من غير فلوس.', 'The owner wants a straight swap, no cash.'), style: _muted),
                      )
                    else ...[
                      const SizedBox(height: 8),
                      TextField(
                        controller: _cash,
                        keyboardType: TextInputType.number,
                        // "1,250,000" as typed (Arabic-Indic digits too); the plain number is sent.
                        inputFormatters: [AmountInputFormatter()],
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(hintText: tr('المبلغ بالجنيه، سيبه فاضي لو مفيش فرق', 'Amount in EGP, empty if none')),
                      ),
                      if (_cashValue > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: payers
                                .map(
                                  (p) => ChoiceChip(
                                    label: Text(p == 'proposer' ? tr('أنا هدفع الفرق', 'I pay the difference') : tr('المالك يدفعلي الفرق', 'The owner pays me')),
                                    selected: _payer == p,
                                    onSelected: (_) => setState(() => _payer = p),
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                      if (_cashValue > 0 && gap < 0 && _payer == 'proposer')
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(tr('خد بالك: وحداتك أغلى، وكمان هتدفع فلوس فوقها.', 'Note: your units are worth more, and you are also paying cash on top.'),
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF8A5A00))),
                        ),
                    ],
                  ],
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!, style: const TextStyle(color: AqarColors.danger, fontWeight: FontWeight.w600)),
                    ),
                  const SizedBox(height: 16),
                  if (_units.isNotEmpty)
                    FilledButton(
                      onPressed: (_busy || _picked.isEmpty) ? null : _send,
                      child: Text(_busy ? tr('جاري…', 'Working…') : tr('ابعت عرض المقايضة', 'Send trade offer')),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    tr('العرض صالح 14 يوم. لو اتقبل، الوحدات بتتحجز والفريق بيتابع معاكم الأوراق.',
                        'Valid for 14 days. If accepted, the units are reserved and our team follows up on the paperwork.'),
                    style: const TextStyle(fontSize: 11.5, height: 1.5, color: AqarColors.textMuted),
                  ),
                ],
              ),
      ),
    );
  }
}
