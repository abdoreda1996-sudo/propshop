import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/trade.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/trade_widgets.dart';

/// My units and their trade switch — the app's twin of /dashboard/listings/[id]/trade.
/// `embedded` renders without its own Scaffold (inside the Trades tab view).
class TradeSettingsScreen extends StatefulWidget {
  const TradeSettingsScreen({super.key, this.embedded = false});
  final bool embedded;
  @override
  State<TradeSettingsScreen> createState() => _TradeSettingsScreenState();
}

class _TradeSettingsScreenState extends State<TradeSettingsScreen> {
  List<MyTradeListing> _listings = const [];
  List<TradeArea> _areas = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final j = await context.read<Api>().tradeSettings();
      if (!mounted) return;
      setState(() {
        _listings = ((j['listings'] as List?) ?? const []).cast<Map<String, dynamic>>().map(MyTradeListing.fromJson).toList();
        _areas = ((j['areas'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeArea.fromJson).toList();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code == 'unauthorized' || e.code == 'network_error'
          ? tradeErrorText(e.code)
          : tr('مش قادرين نحمّل وحداتك.', "We couldn't load your units."));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit(MyTradeListing l) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TradeRequirementsScreen(listing: l, areas: _areas)),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final body = _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
            ? ErrorNotice(message: _error!, onRetry: _load)
            : _listings.isEmpty
                ? EmptyState(
                    title: tr('لسه مفيش وحدات', 'No units yet'),
                    body: tr('اعرض وحدتك الأول، وبعد التوثيق تقدر تفتحها للمقايضة.', 'List your unit first; once verified you can open it to trade.'),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                      itemCount: _listings.length,
                      itemBuilder: (_, i) {
                        final l = _listings[i];
                        return InkWell(
                          onTap: () => _edit(l),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
                            child: Row(children: [
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(l.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AqarColors.ink900)),
                                  const SizedBox(height: 2),
                                  Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                                    Text(l.reference, style: const TextStyle(fontSize: 12, color: AqarColors.textMuted, fontFeatures: AqarType.tnum)),
                                    if (l.openToTrade) const TradeBadge(),
                                  ]),
                                  if (l.openToTrade && !l.visible)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(tr('هتظهر في السوق بعد النشر والتوثيق', 'Shows in the market once live and verified'),
                                          style: const TextStyle(fontSize: 11.5, color: Color(0xFF8A5A00))),
                                    ),
                                ]),
                              ),
                              const SizedBox(width: 8),
                              Text(l.openToTrade ? tr('تعديل', 'Edit') : tr('افتحها للمقايضة', 'Open to trade'),
                                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AqarColors.brand500)),
                            ]),
                          ),
                        );
                      },
                    ),
                  );
    if (widget.embedded) return body;
    return Scaffold(appBar: AppBar(title: Text(tr('وحداتي للمقايضة', 'My units for trade'))), body: body);
  }
}

/// The switch + "what do you want in return". Requirements guide matching; they never
/// block an offer — except the cash term, which the server enforces.
class TradeRequirementsScreen extends StatefulWidget {
  const TradeRequirementsScreen({super.key, required this.listing, required this.areas});
  final MyTradeListing listing;
  final List<TradeArea> areas;
  @override
  State<TradeRequirementsScreen> createState() => _TradeRequirementsScreenState();
}

class _TradeRequirementsScreenState extends State<TradeRequirementsScreen> {
  static const _types = ['apartment', 'studio', 'duplex', 'ground_apartment', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'chalet', 'office', 'retail'];
  static const _cash = ['either', 'i_receive', 'i_pay', 'none'];

  late bool _open = widget.listing.openToTrade;
  late final Set<String> _types0 = {...widget.listing.preference.types};
  late final Set<String> _areaIds = {...widget.listing.preference.areaIds};
  late String _cashTerm = widget.listing.preference.cash;
  late final _beds = TextEditingController(text: widget.listing.preference.minBedrooms?.toString() ?? '');
  late final _size = TextEditingController(text: widget.listing.preference.minSizeSqm?.round().toString() ?? '');
  late final _minV = TextEditingController(text: widget.listing.preference.minValue?.round().toString() ?? '');
  late final _maxV = TextEditingController(text: widget.listing.preference.maxValue?.round().toString() ?? '');
  late final _note = TextEditingController(text: widget.listing.preference.note ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_beds, _size, _minV, _maxV, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  num? _n(TextEditingController c) {
    final t = c.text.replaceAll(RegExp(r'[^0-9]'), '');
    return t.isEmpty ? null : num.parse(t);
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().saveTradeSettings(
        widget.listing.id,
        openToTrade: _open,
        preference: {
          'types': _types0.toList(),
          'areaIds': _areaIds.toList(),
          'minBedrooms': _n(_beds),
          'minSizeSqm': _n(_size),
          'minValue': _n(_minV),
          'maxValue': _n(_maxV),
          'cash': _cashTerm,
          'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
        },
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = tradeErrorText(e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
      );

  Widget _num(String label, TextEditingController c) => Expanded(
        child: TextField(controller: c, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label)),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.listing.reference), actions: const [LangToggleButton()]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_error != null)
              Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: const TextStyle(color: AqarColors.danger))),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? tr('جاري…', 'Working…') : tr('احفظ', 'Save'))),
            ),
          ]),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _open,
            onChanged: (v) => setState(() => _open = v),
            title: Text(tr('الوحدة متاحة للمقايضة', 'Open to trade'), style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(tr(
              'لما تفتحها، هيظهر على الوحدة زرار «اعرض مقايضة» وهتظهر في سوق المقايضة. والبيع بيفضل شغال عادي.',
              'When on, an “Offer a trade” button appears on the unit and it shows in the trade market. Selling stays on.',
            )),
          ),
          Opacity(
            opacity: _open ? 1 : 0.45,
            child: IgnorePointer(
              ignoring: !_open,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Divider(height: 24),
              Text(tr('عايز تقايض بإيه؟', 'What do you want in return?'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
              const SizedBox(height: 2),
              Text(tr('كله اختياري. اللي هتسيبه فاضي معناه أي حاجة.', 'All optional. Anything left empty means any.'),
                  style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500)),
              _label(tr('نوع الوحدة', 'Unit type')),
              Wrap(spacing: 6, runSpacing: 6, children: _types.map((t) => FilterChip(
                    label: Text(unitTypeLabel(t)),
                    selected: _types0.contains(t),
                    onSelected: (v) => setState(() => v ? _types0.add(t) : _types0.remove(t)),
                  )).toList()),
              _label(tr('المنطقة', 'Area')),
              Wrap(spacing: 6, runSpacing: 6, children: widget.areas.map((a) => FilterChip(
                    label: Text(a.name),
                    selected: _areaIds.contains(a.id),
                    onSelected: (v) => setState(() => v ? _areaIds.add(a.id) : _areaIds.remove(a.id)),
                  )).toList()),
              _label(tr('الحد الأدنى', 'Minimums')),
              Row(children: [_num(tr('غرف نوم', 'Bedrooms'), _beds), const SizedBox(width: 10), _num(tr('المساحة م²', 'Size sqm'), _size)]),
              _label(tr('القيمة (ج.م)', 'Value (EGP)')),
              Row(children: [_num(tr('من', 'From'), _minV), const SizedBox(width: 10), _num(tr('لحد', 'Up to'), _maxV)]),
              _label(tr('فرق الفلوس', 'Cash difference')),
              Wrap(spacing: 6, runSpacing: 6, children: _cash.map((c) => ChoiceChip(
                    label: Text(cashTermLabel(c)),
                    selected: _cashTerm == c,
                    onSelected: (_) => setState(() => _cashTerm = c),
                  )).toList()),
              _label(tr('ملاحظة', 'Note')),
              TextField(controller: _note, maxLength: 500, maxLines: 3),
            ]),
            ),
          ),
        ],
      ),
    );
  }
}
