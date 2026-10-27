import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/trade.dart' show tradeErrorText;
import '../models/trade_request.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/filter_controls.dart';
import 'listing_screen_loader.dart';
import 'login_screen.dart';
import 'trade_market_screen.dart';
import 'trades_screen.dart';

/// Trade requests — the app's twin of /dashboard/trades/request/*. A lister who wants to
/// trade says which unit they want in exchange, with the same controls as the browse
/// filters, and which of their own units they offer. Saving opens that unit to trade and
/// shows every unit open to trade that already fits; later ones arrive as notifications.

/// Where every "trade my unit" entry point lands. Signs the user in first; when
/// [listingId] already has a request, that request is edited rather than duplicated
/// (as the website redirects /request/new?listing= to the existing one).
Future<void> openNewTradeRequest(BuildContext context, {String? listingId}) async {
  final nav = Navigator.of(context);
  final session = context.read<SessionController>();
  final api = context.read<Api>();
  if (!session.isSignedIn) {
    final ok = await nav.push<bool>(MaterialPageRoute(builder: (_) => const LoginScreen()));
    if (ok != true) return;
  }
  TradeRequest? existing;
  if (listingId != null) {
    try {
      final j = await api.tradeRequests();
      for (final r in ((j['requests'] as List?) ?? const []).cast<Map<String, dynamic>>()) {
        if (r['listingId'] == listingId) existing = TradeRequest.fromJson(r);
      }
    } on ApiException {
      // Starting fresh is the safe fallback; the server never duplicates the opened unit.
    }
  }
  nav.push(MaterialPageRoute(builder: (_) => TradeRequestFormScreen(existing: existing, listingId: listingId)));
}

/// Lookups the form and the request page share: areas, compounds and the user's own units.
class _Lookups {
  _Lookups(this.areas, this.compounds, this.listings);
  final List<Place> areas;
  final List<Place> compounds;

  /// The user's listings they could give in exchange: anything not already gone.
  final List<Map<String, dynamic>> listings;

  Place? area(String id) => areas.where((a) => a.id == id).firstOrNull;
  Place? compound(String id) => compounds.where((c) => c.id == id).firstOrNull;

  static Future<_Lookups> load(Api api) async {
    final r = await Future.wait([api.compounds(), api.myListings()]);
    final places = placesFromCompounds(((r[0]['compounds'] as List?) ?? const []).cast<Map<String, dynamic>>());
    final listings = [
      for (final l in ((r[1]['listings'] as List?) ?? const []).cast<Map<String, dynamic>>())
        if (!const ['sold', 'closed', 'reserved'].contains(l['status'])) l,
    ];
    return _Lookups(places.areas, places.compounds, listings);
  }
}

String _listingLabel(Map<String, dynamic> l) {
  final title = (isEn ? l['titleEn'] : l['titleAr']) as String? ?? '';
  return title.isEmpty ? '${l['reference']}' : '${l['reference']} · $title';
}

/* ── Form ───────────────────────────────────────────────────────────────── */

class TradeRequestFormScreen extends StatefulWidget {
  const TradeRequestFormScreen({super.key, this.existing, this.listingId});

  /// Set when editing.
  final TradeRequest? existing;

  /// Preselects the unit offered in exchange.
  final String? listingId;

  @override
  State<TradeRequestFormScreen> createState() => _TradeRequestFormScreenState();
}

class _TradeRequestFormScreenState extends State<TradeRequestFormScreen> {
  static const _descriptionMax = 500;

  _Lookups? _lookups;
  String? _loadError;
  bool _busy = false;
  String? _error;

  late String? _listingId = widget.existing?.listingId ?? widget.listingId;
  late List<String> _types = [...?widget.existing?.spec.types];
  late List<String> _areaIds = [...?widget.existing?.spec.areaIds];
  late List<String> _compoundIds = [...?widget.existing?.spec.compoundIds];
  late List<String> _beds = [...?widget.existing?.spec.bedrooms];
  late List<String> _baths = [...?widget.existing?.spec.bathrooms];
  late List<String> _payment = [...?widget.existing?.spec.payment];
  late final _min = TextEditingController(text: _fmt(widget.existing?.spec.minPrice));
  late final _max = TextEditingController(text: _fmt(widget.existing?.spec.maxPrice));
  late final _description = TextEditingController(text: widget.existing?.spec.description ?? '');
  final _query = TextEditingController();

  static String _fmt(double? n) => n == null ? '' : formatNumber(n.round(), ar: false);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    _description.dispose();
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final l = await _Lookups.load(context.read<Api>());
      if (!mounted) return;
      setState(() {
        _lookups = l;
        // A preselected unit that is gone (sold, reserved) is not offered.
        if (_listingId != null && !l.listings.any((x) => x['id'] == _listingId)) _listingId = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loadError = tradeErrorText(e.code));
    }
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final j = await context.read<Api>().saveTradeRequest(widget.existing?.id, {
        'listingId': _listingId,
        'types': _types,
        'areaIds': _areaIds,
        'compoundIds': _compoundIds,
        'bedrooms': _beds,
        'bathrooms': _baths,
        'payment': _payment,
        'minPrice': parseAmount(_min.text),
        'maxPrice': parseAmount(_max.text),
        'description': _description.text,
      });
      if (!mounted) return;
      final id = (j['id'] ?? widget.existing?.id) as String;
      final matches = ((j['matches'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeRequestMatch.fromJson).toList();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => TradeRequestScreen(id: id, justSaved: true, initialMatches: matches)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      final codes = [for (final x in ((e.body?['errors'] as List?) ?? const [])) '${(x as Map)['code']}'];
      setState(() => _error = codes.contains('empty')
          ? tr('اختار حاجة واحدة على الأقل في الوحدة اللي عايزها: منطقة أو نوع أو عدد غرف.',
              'Choose at least one thing about the unit you want: a location, a type or a number of rooms.')
          : e.code == 'invalid_fields'
              ? tr('راجع السعر. يا إما الحد الأدنى أكبر من الأقصى، يا إما في رقم مش مظبوط.',
                  'Check the price. Either the minimum is above the maximum or a figure is not valid.')
              : e.code == 'listing_closed'
                  ? tr('الوحدة دي اتحجزت أو اتقفلت. اختار وحدة تانية.', 'That unit is reserved or closed. Choose another.')
                  : tradeErrorText(e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _lookups;
    return Scaffold(
      appBar: AppBar(title: Text(tr('طلب مقايضة', 'Trade request')), actions: const [LangToggleButton()]),
      body: l == null
          ? (_loadError != null
              ? ErrorNotice(message: _loadError!, onRetry: _load)
              : const Center(child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                Text(
                  tr('قول عايز تقايض وحدتك بإيه، وإحنا نوريك كل الوحدات المناسبة ونبلغك بالجديد.',
                      'Say what you want for your unit; we show every unit that fits and tell you about new ones.'),
                  style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.textMuted),
                ),
                const SizedBox(height: 16),
                if (l.listings.isNotEmpty) ...[_listingCard(l), const SizedBox(height: 16)],
                _wantCard(l),
                const SizedBox(height: 16),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(_error!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.danger)),
                  ),
                FilledButton(
                  onPressed: _busy ? null : _save,
                  child: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AqarColors.brand500))
                      : Text(tr('احفظ ووريني الوحدات المناسبة', 'Save and show matching units')),
                ),
              ],
            ),
    );
  }

  Widget _card(List<Widget> children) => Container(
        padding: const EdgeInsets.only(top: 18, bottom: 6),
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: AqarColors.border))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );

  Widget _listingCard(_Lookups l) => _card([
        Text(tr('هتقايض بأنهي وحدة من وحداتك؟', 'Which of your units will you trade?'),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
        const SizedBox(height: 4),
        Text(
          tr('هنفتحها للمقايضة وتظهر في السوق ومعاها الطلب ده.', 'We open it to trade and show it in the market with this request.'),
          style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String?>(
          initialValue: _listingId,
          isExpanded: true,
          items: [
            DropdownMenuItem<String?>(value: null, child: Text(tr('مش هحدد دلوقتي', 'Decide later'))),
            for (final x in l.listings)
              DropdownMenuItem<String?>(
                value: x['id'] as String,
                child: Text(_listingLabel(x), maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (v) => setState(() => _listingId = v),
        ),
      ]);

  Widget _wantCard(_Lookups l) {
    final q = _query.text;
    // Compounds first (that is what people type), then areas; picked ones left out.
    final suggestions = [
      ...rankPlaces(l.compounds.where((c) => !_compoundIds.contains(c.id)), q, 6),
      ...rankPlaces(l.areas.where((a) => !_areaIds.contains(a.id)), q, 4),
    ];
    final chips = [
      for (final id in _compoundIds) ?l.compound(id),
      for (final id in _areaIds) ?l.area(id),
    ];
    void pick(Place p) => setState(() {
          if (p.isCompound) {
            _compoundIds = [..._compoundIds, p.id];
          } else {
            _areaIds = [..._areaIds, p.id];
          }
          _query.clear();
        });

    return _card([
      Text(tr('الوحدة اللي عايزها', 'The unit you want'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
      const SizedBox(height: 4),
      Text(
        tr('نفس فلاتر البحث، واللي هتسيبه فاضي معناه أي حاجة. هنوريك الوحدات المتاحة للمقايضة اللي بتناسبك، ونبعتلك إشعار لما تنزل وحدة جديدة زيها.',
            'The same filters as search; anything left empty means any. We show the units open to trade that fit, and notify you when a new one is listed.'),
        style: const TextStyle(fontSize: 12.5, height: 1.6, color: AqarColors.textMuted),
      ),
      const SizedBox(height: 18),

      // Location: type-ahead over compounds and areas, chips, and the areas one tap each.
      FilterLegend(tr('المنطقة والكمبوند', 'Area & compound')),
      TextField(
        controller: _query,
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) {
          if (suggestions.isNotEmpty) pick(suggestions.first);
        },
        style: const TextStyle(fontSize: 14, color: AqarColors.ink900),
        decoration: InputDecoration(
          isDense: true,
          hintText: tr('اكتب اسم الكمبوند أو المنطقة', 'Type a compound or area'),
          hintStyle: const TextStyle(fontSize: 14, color: AqarColors.ink400),
          prefixIcon: const Icon(Icons.search, size: 18, color: AqarColors.ink400),
        ),
      ),
      if (q.trim().isNotEmpty)
        Container(
          margin: const EdgeInsets.only(top: 4),
          decoration: BoxDecoration(
            border: Border.all(color: AqarColors.border),
            borderRadius: BorderRadius.circular(AqarRadius.control),
          ),
          child: suggestions.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(tr('مفيش أسماء قريبة من كده.', 'No similar names.'), style: const TextStyle(fontSize: 13, color: AqarColors.textMuted)),
                )
              : Column(children: [
                  for (final p in suggestions)
                    PlaceSuggestionTile(
                      place: p,
                      caption: p.isCompound ? (p.areaId == null ? null : l.area(p.areaId!)?.name) : null,
                      onTap: () => pick(p),
                    ),
                ]),
        ),
      if (chips.isNotEmpty) ...[
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final p in chips)
            PlaceChip(
              place: p,
              onRemove: () => setState(() {
                if (p.isCompound) {
                  _compoundIds = [for (final x in _compoundIds) if (x != p.id) x];
                } else {
                  _areaIds = [for (final x in _areaIds) if (x != p.id) x];
                }
              }),
            ),
        ]),
      ],
      const SizedBox(height: 10),
      Wrap(spacing: 6, runSpacing: 6, children: [
        for (final a in l.areas)
          if (!_areaIds.contains(a.id))
            ActionChip(
              label: Text('+ ${a.name}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ink700)),
              backgroundColor: Colors.white,
              side: const BorderSide(color: AqarColors.ink200),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              visualDensity: VisualDensity.compact,
              onPressed: () => setState(() => _areaIds = [..._areaIds, a.id]),
            ),
      ]),
      const SizedBox(height: 20),

      FilterLegend(tr('نوع الوحدة', 'Property type')),
      const SizedBox(height: 4),
      UnitTypeSections(picked: _types, spacing: 10, onChanged: (v) => setState(() => _types = v)),
      const SizedBox(height: 20),

      RoomPillRow(title: tr('غرف النوم', 'Bedrooms'), options: bedOptions, picked: _beds, onChanged: (v) => setState(() => _beds = v)),
      const SizedBox(height: 16),
      RoomPillRow(title: tr('الحمامات', 'Bathrooms'), options: bathOptions, picked: _baths, onChanged: (v) => setState(() => _baths = v)),
      const SizedBox(height: 20),

      FilterLegend(tr('نطاق السعر', 'Price range')),
      Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          _priceInput(true),
          const Padding(padding: EdgeInsets.fromLTRB(8, 0, 8, 14), child: Text('–', style: TextStyle(color: AqarColors.ink400))),
          _priceInput(false),
        ],
      ),
      const SizedBox(height: 20),

      FilterLegend(tr('طريقة الدفع', 'Payment')),
      Wrap(spacing: 16, children: [
        for (final o in paymentOptions)
          IntrinsicWidth(
            child: FilterCheckRow(
              label: tr(o.ar, o.en),
              value: _payment.contains(o.value),
              onTap: () => setState(() => _payment = flipValue(_payment, o.value)),
            ),
          ),
      ]),
      const SizedBox(height: 20),

      FilterLegend(tr('وصف قصير (اختياري)', 'Short description (optional)')),
      TextField(
        controller: _description,
        maxLength: _descriptionMax,
        minLines: 3,
        maxLines: 6,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          hintText: tr('مثلاً: عايز دور أرضي بجنينة، وممكن أدفع فرق.', 'e.g. Ground floor with a garden; I can pay a difference.'),
          hintStyle: const TextStyle(fontSize: 13.5, color: AqarColors.ink400),
        ),
      ),
    ]);
  }

  Widget _priceInput(bool isMin) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(isMin ? tr('من', 'Minimum') : tr('إلى', 'Maximum'),
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ink500)),
            const SizedBox(height: 4),
            Directionality(
              textDirection: TextDirection.ltr,
              child: TextField(
                controller: isMin ? _min : _max,
                keyboardType: TextInputType.number,
                inputFormatters: [AmountInputFormatter()],
                style: const TextStyle(fontSize: 15, color: AqarColors.ink900),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: isMin ? tr('بدون حد أدنى', 'No min') : tr('بدون حد أقصى', 'No max'),
                  hintStyle: const TextStyle(fontSize: 14, color: AqarColors.ink400),
                  suffixIcon: Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: Text(tr('ج.م', 'EGP'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AqarColors.ink400)),
                  ),
                  suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
                ),
              ),
            ),
          ],
        ),
      );
}

/* ── One request and its matches ────────────────────────────────────────── */

class TradeRequestScreen extends StatefulWidget {
  const TradeRequestScreen({super.key, required this.id, this.justSaved = false, this.initialMatches});

  final String id;

  /// Straight after saving: says so above the matches.
  final bool justSaved;
  final List<TradeRequestMatch>? initialMatches;

  @override
  State<TradeRequestScreen> createState() => _TradeRequestScreenState();
}

class _TradeRequestScreenState extends State<TradeRequestScreen> {
  TradeRequest? _request;
  late List<TradeRequestMatch> _matches = widget.initialMatches ?? const [];
  _Lookups? _lookups;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final api = context.read<Api>();
      final r = await Future.wait([api.tradeRequest(widget.id), if (_lookups == null) _Lookups.load(api)]);
      if (!mounted) return;
      final j = r[0] as Map<String, dynamic>;
      setState(() {
        _request = TradeRequest.fromJson(j['request'] as Map<String, dynamic>);
        _matches = ((j['matches'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeRequestMatch.fromJson).toList();
        if (r.length > 1) _lookups = r[1] as _Lookups;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = tradeErrorText(e.code));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = tradeErrorText(''));
    }
  }

  Future<void> _toggle() async {
    final r = _request;
    if (r == null) return;
    setState(() => _busy = true);
    try {
      await context.read<Api>().setTradeRequestActive(r.id, !r.active);
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tradeErrorText(e.code))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        content: Text(tr('تمسح طلب المقايضة ده؟', 'Delete this trade request?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('رجوع', 'Back'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('امسح', 'Delete'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<Api>().deleteTradeRequest(widget.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tradeErrorText(e.code))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The request read back as the chips a filter bar would show.
  List<String> _chips(TradeRequestSpec s, _Lookups l) {
    String opt(List<RoomOption> o, String v) => roomOptionLabel(o, v);
    String price(double v) => formatPriceExact(v);
    String payLabel(String v) {
      for (final o in paymentOptions) {
        if (o.value == v) return tr(o.ar, o.en);
      }
      return v;
    }

    return [
      for (final id in s.compoundIds) ?l.compound(id)?.name,
      for (final id in s.areaIds) ?l.area(id)?.name,
      for (final t in s.types) unitTypeLabel(t),
      for (final v in s.bedrooms) opt(bedOptions, v),
      for (final v in s.bathrooms) opt(bathOptions, v),
      if (s.minPrice != null && s.maxPrice != null)
        '${price(s.minPrice!)} – ${price(s.maxPrice!)}'
      else if (s.maxPrice != null)
        '${tr('لحد', 'Up to')} ${price(s.maxPrice!)}'
      else if (s.minPrice != null)
        '${tr('من', 'From')} ${price(s.minPrice!)}',
      for (final v in s.payment) payLabel(v),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final r = _request;
    final l = _lookups;
    return Scaffold(
      appBar: AppBar(title: Text(tr('طلب المقايضة', 'Trade request')), actions: const [LangToggleButton()]),
      body: r == null || l == null
          ? (_error != null ? ErrorNotice(message: _error!, onRetry: _load) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  if (widget.justSaved)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        tr('اتحفظ. دي الوحدات اللي بتناسب طلبك دلوقتي.', 'Saved. These are the units that fit your request right now.'),
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AqarColors.ok700),
                      ),
                    ),
                  _summary(r, l),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    OutlinedButton(
                      onPressed: _busy ? null : _toggle,
                      child: Text(r.active ? tr('وقّف الإشعارات', 'Pause notifications') : tr('شغّل الإشعارات', 'Resume notifications')),
                    ),
                    OutlinedButton(
                      onPressed: _busy ? null : _delete,
                      style: OutlinedButton.styleFrom(foregroundColor: AqarColors.danger),
                      child: Text(tr('امسح', 'Delete')),
                    ),
                  ]),
                  const SizedBox(height: 22),
                  Text(
                    '${tr('وحدات متاحة للمقايضة بتناسبك', 'Units open to trade that fit')} (${formatNumber(_matches.length)})',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900),
                  ),
                  const SizedBox(height: 10),
                  if (_matches.isEmpty)
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(
                          tr('مفيش وحدة بتناسب طلبك دلوقتي. أول ما تنزل واحدة هتلاقيها في الإشعارات.',
                              'Nothing fits yet. When one is listed, it shows up in your notifications.'),
                          style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.textMuted),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton(
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TradeMarketScreen())),
                          child: Text(tr('تصفح سوق المقايضة', 'Browse the trade market')),
                        ),
                      ])
                  else
                    for (final m in _matches) Padding(padding: const EdgeInsets.only(bottom: 12), child: TradeRequestMatchCard(match: m)),
                ],
              ),
            ),
    );
  }

  Widget _summary(TradeRequest r, _Lookups l) {
    final offered = r.listingId == null ? null : l.listings.where((x) => x['id'] == r.listingId).firstOrNull;
    final chips = _chips(r.spec, l);
    return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(tr('اللي إنت عايزه', 'What you want'),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
            ),
            TextButton(
              onPressed: () async {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TradeRequestFormScreen(existing: r)));
                if (mounted) _load();
              },
              child: Text(tr('عدّل', 'Edit')),
            ),
          ]),
          Text(
            chips.isEmpty ? tr('أي وحدة', 'Any unit') : chips.join('  ·  '),
            style: const TextStyle(fontSize: 14, height: 1.6, fontWeight: FontWeight.w500, color: AqarColors.ink900, fontFeatures: AqarType.tnum),
          ),
          if ((r.spec.description ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(r.spec.description!, style: const TextStyle(fontSize: 13.5, height: 1.6, color: AqarColors.ink900)),
          ],
          const SizedBox(height: 10),
          if (r.listingId != null)
            Text(
              '${tr('هتقايض بـ', 'Trading')} ${offered?['reference'] ?? ''}',
              style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted),
            ),
          Text(
            r.active
                ? tr('هنبعتلك إشعار بأي وحدة جديدة بتناسب الطلب.', 'You are notified of every new unit that fits.')
                : tr('الإشعارات واقفة.', 'Notifications are paused.'),
            style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted),
          ),
        ],
    );
  }
}

class TradeRequestMatchCard extends StatelessWidget {
  const TradeRequestMatchCard({super.key, required this.match});
  final TradeRequestMatch match;

  @override
  Widget build(BuildContext context) {
    final m = match;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => openListingByReference(context, m.reference),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 16 / 10,
              child: m.photo == null
                  ? Container(color: AqarColors.ink100)
                  : CachedNetworkImage(
                      imageUrl: absoluteMediaUrl(m.photo!),
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(color: AqarColors.ink100),
                      errorWidget: (_, __, ___) => Container(color: AqarColors.ink100),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(formatPriceExact(m.price, currency: m.currency), style: AqarType.figure(size: 17)),
                  const SizedBox(height: 2),
                  Text(m.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AqarColors.ink900)),
                  Text(
                    '${unitTypeLabel(m.type)} · ${formatNumber(m.bedrooms)} ${tr('غرف', 'bed')} · ${formatNumber(m.bathrooms)} ${tr('حمام', 'bath')} · ${m.place}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* ── My trade requests (a tab of Trades) ────────────────────────────────── */

class MyTradeRequestsView extends StatefulWidget {
  const MyTradeRequestsView({super.key});
  @override
  State<MyTradeRequestsView> createState() => _MyTradeRequestsViewState();
}

class _MyTradeRequestsViewState extends State<MyTradeRequestsView> {
  List<TradeRequest> _rows = const [];
  Map<String, String> _references = const {};
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
      final api = context.read<Api>();
      final r = await Future.wait([api.tradeRequests(), api.myListings()]);
      if (!mounted) return;
      setState(() {
        _rows = ((r[0]['requests'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeRequest.fromJson).toList();
        _references = {
          for (final l in ((r[1]['listings'] as List?) ?? const []).cast<Map<String, dynamic>>()) l['id'] as String: '${l['reference']}',
        };
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = tradeErrorText(e.code));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ErrorNotice(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Expanded(
              child: Text(tr('طلبات المقايضة بتاعتك', 'Your trade requests'),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
            ),
            TextButton(
              onPressed: () => _open(const TradeRequestFormScreen()),
              child: Text(tr('طلب جديد', 'New request')),
            ),
          ]),
          const SizedBox(height: 10),
          if (_rows.isEmpty)
            Text(
              tr('قول عايز تقايض وحدتك بإيه بنفس فلاتر البحث، وإحنا نوريك المناسب ونبلغك بأي وحدة جديدة زيه.',
                  'Say what you want for your unit with the search filters. We show what fits and tell you about new units.'),
              style: const TextStyle(fontSize: 13, height: 1.6, color: AqarColors.textMuted),
            )
          else
            for (final r in _rows)
              DecoratedBox(
                decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '${r.listingId != null && _references[r.listingId] != null ? '${_references[r.listingId]} → ' : ''}'
                    '${(r.spec.description ?? '').isNotEmpty ? _clip(r.spec.description!, 40) : tr('طلب مقايضة', 'Trade request')}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                  ),
                  subtitle: Text(
                    '${formatDate(r.createdAt)} · ${r.active ? tr('الإشعارات شغالة', 'Notifications on') : tr('الإشعارات واقفة', 'Notifications paused')}',
                    style: const TextStyle(fontSize: 12, color: AqarColors.textMuted),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: AqarColors.ink400),
                  onTap: () => _open(TradeRequestScreen(id: r.id)),
                ),
              ),
        ],
      ),
    );
  }

  static String _clip(String s, int n) => s.length <= n ? s : '${s.substring(0, n)}…';
}

/* ── Notifications ──────────────────────────────────────────────────────── */

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _items = const [];
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
      final j = await context.read<Api>().notifications();
      if (!mounted) return;
      setState(() => _items = ((j['notifications'] as List?) ?? const []).cast<Map<String, dynamic>>().map(AppNotification.fromJson).toList());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = tradeErrorText(e.code));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
    if (mounted) context.read<SessionController>().refreshNotifications();
  }

  Future<void> _readAll() async {
    try {
      await context.read<Api>().readAllNotifications();
    } on ApiException {
      // The list reloads either way.
    }
    if (mounted) _load();
  }

  /// Marks it read, then opens what it points at — a listing, a trade request, or trades.
  Future<void> _open(AppNotification n) async {
    final api = context.read<Api>();
    try {
      await api.openNotification(n.id);
    } on ApiException {
      // Opening must still work when marking read did not.
    }
    if (!mounted) return;
    final href = n.href ?? '';
    final listing = RegExp(r'^/listing/([^/?#]+)').firstMatch(href);
    final request = RegExp(r'^/dashboard/trades/request/([^/?#]+)').firstMatch(href);
    if (listing != null) {
      await openListingByReference(context, Uri.decodeComponent(listing.group(1)!));
    } else if (request != null && request.group(1) != 'new') {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TradeRequestScreen(id: request.group(1)!)));
    } else if (href.startsWith('/dashboard/trades')) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TradesScreen()));
    }
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final unread = _items.where((n) => !n.read).length;
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('الإشعارات', 'Notifications')),
        actions: [
          if (unread > 0) TextButton(onPressed: _readAll, child: Text(tr('علّم الكل كمقروء', 'Mark all as read'))),
          const LangToggleButton(),
        ],
      ),
      body: _loading && _items.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _items.isEmpty
              ? ErrorNotice(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? scrollableEmpty(
                          EmptyState(
                            title: tr('مفيش إشعارات لسه', 'No notifications yet'),
                            body: tr('لما تنزل وحدة جديدة تناسب طلب المقايضة بتاعك، هتلاقيها هنا.',
                                'When a new unit fits your trade request, it shows up here.'),
                          ),
                        )
                      : ListView.separated(
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final n = _items[i];
                            return Material(
                              color: Colors.white,
                              child: InkWell(
                                onTap: () => _open(n),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Container(
                                        margin: const EdgeInsets.only(top: 6),
                                        width: 8,
                                        height: 8,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: n.read ? Colors.transparent : AqarColors.accent500,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(n.title,
                                                style: TextStyle(
                                                    fontSize: 14,
                                                    fontWeight: n.read ? FontWeight.w500 : FontWeight.w700,
                                                    color: AqarColors.ink900)),
                                            if ((n.body ?? '').isNotEmpty)
                                              Padding(
                                                padding: const EdgeInsets.only(top: 2),
                                                child: Text(n.body!, maxLines: 2, overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted)),
                                              ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(formatDate(n.createdAt), style: const TextStyle(fontSize: 11.5, color: AqarColors.textMuted, fontFeatures: AqarType.tnum)),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
