import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/listing.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/segments.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/filter_controls.dart';
import '../widgets/listing_card.dart';
import 'listing_screen.dart';
import 'open_request_screen.dart';
import 'trade_request_screens.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({
    super.key,
    this.initialPurpose = 'sale',
    this.initialSegment,
    this.areaSlug,
    this.compoundSlug,
    this.title,
  });

  /// Discover links straight into "for sale" or "trade", so the browse screen opens
  /// already filtered rather than making the user set it again.
  /// 'sale' | 'trade' — the bar's first button. (Rent was removed, 2026-10-11;
  /// an old 'all' or 'rent' value opens as 'sale'.)
  final String initialPurpose;

  /// Set when arriving from a segment tab on discover, so the browse screen opens in the
  /// market the user picked. Null means every segment — the "all" tab.
  final Segment? initialSegment;

  /// Set when arriving from a compound or area tile. The tile promises a filtered list,
  /// so it has to actually filter — the server has supported both since /api/listings
  /// shipped; only this screen was dropping them.
  final String? areaSlug;
  final String? compoundSlug;

  /// Names the filter in the app bar, so the user can see why the list is narrowed.
  final String? title;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _scrollController = ScrollController();
  final List<ListingCard> _items = [];

  /// Everything the bar filters by. Each panel edits a copy and hands it back on Apply.
  late _Filters _f = _Filters(
    trade: widget.initialPurpose == 'trade',
    segments: [if (widget.initialSegment != null) segmentSlug(widget.initialSegment!)],
    areas: [if (widget.areaSlug != null) widget.areaSlug!],
    compounds: [if (widget.compoundSlug != null) widget.compoundSlug!],
  );
  String _sort = 'newest';
  final _qController = TextEditingController();
  final _qFocus = FocusNode();

  /// Compounds (with their areas) — the Location panel's lists, and the names the
  /// Location button shows. Loaded once per screen rather than per panel open.
  List<Map<String, dynamic>> _compounds = const [];

  bool _loading = false;
  bool _hasMore = true;
  int _page = 1;
  int _total = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _qFocus.addListener(() => setState(() {}));
    _load(reset: true);
    context.read<Api>().compounds().then((j) {
      if (mounted) setState(() => _compounds = ((j['compounds'] as List?) ?? const []).cast<Map<String, dynamic>>());
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _qController.dispose();
    _qFocus.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_loading &&
        _hasMore &&
        _scrollController.position.pixels >
            _scrollController.position.maxScrollExtent - 600) {
      _load();
    }
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      if (reset) {
        _error = null;
        _page = 1;
        _hasMore = true;
        _items.clear();
      }
    });

    try {
      final api = context.read<Api>();
      // Trade is not a purpose — a unit can be for sale AND open to trade — so it is sent
      // as `trade=open` with no purpose.
      final json = await api.searchListings(
        purpose: _f.trade ? null : 'sale',
        trade: _f.trade,
        withoutOver: _f.withoutOver,
        segments: _f.segments,
        areas: _f.areas,
        compounds: _f.compounds,
        types: _f.types,
        beds: _f.beds,
        baths: _f.baths,
        minPrice: _f.minPrice,
        maxPrice: _f.maxPrice,
        finishings: _f.finishings,
        deliveries: _f.deliveries,
        payments: _f.payments,
        q: _f.q,
        sort: _sort,
        page: _page,
      );
      final rawItems = (json['items'] as List).cast<Map<String, dynamic>>();
      final pages = (json['pages'] as num?)?.toInt() ?? 1;

      if (!mounted) return;
      setState(() {
        _items.addAll(rawItems.map(ListingCard.fromJson));
        _total = (json['total'] as num?)?.toInt() ?? _items.length;
        _hasMore = _page < pages;
        _page += 1;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// [_error] holds the API error code; the message is resolved at build time so it
  /// follows the current language.
  String _errorMessage(String code) => code == 'network_error'
      ? tr(
          'تأكد إنك متصل بالإنترنت وإن السيرفر شغال.',
          'Check that you are online and the server is running.',
        )
      : tr(
          'حصل خطأ غير متوقع ($code).',
          'Something unexpected went wrong ($code).',
        );

  void _setFilters(_Filters next) {
    setState(() => _f = next);
    if (_qController.text != next.q) _qController.text = next.q;
    _load(reset: true);
  }

  /// Opens one of the bar's panels on a copy of the filters. Dismissing returns null and
  /// changes nothing; only Apply runs a new search.
  Future<void> _openPanel(_PanelKey key) async {
    final r = await showModalBottomSheet<_Filters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      clipBehavior: Clip.antiAlias,
      builder: (_) => _FilterPanel(panel: key, initial: _f, compounds: _compounds),
    );
    if (r == null || !mounted) return;
    _setFilters(r);
  }

  /* ── Button captions ──────────────────────────────────────────────────── */

  String? _areaName(String slug) {
    for (final c in _compounds) {
      final a = c['area'] as Map<String, dynamic>?;
      if (a?['slug'] == slug) return (isEn ? a!['nameEn'] : a!['nameAr']) as String;
    }
    return null;
  }

  String? _compoundName(String slug) {
    for (final c in _compounds) {
      if (c['slug'] == slug) return (isEn ? c['nameEn'] : c['nameAr']) as String;
    }
    return null;
  }

  String get _priceCaption {
    final lo = _f.minPrice, hi = _f.maxPrice;
    final String range;
    if (lo != null && hi != null) {
      range = '${_short(lo)} – ${_short(hi)}';
    } else if (hi != null) {
      range = tr('حتى ${_short(hi)}', 'Up to ${_short(hi)}');
    } else if (lo != null) {
      range = tr('من ${_short(lo)}', '${_short(lo)}+');
    } else {
      range = tr('السعر', 'Price');
    }
    // "Price · Cash" when exactly one payment choice is on, as the website's button.
    final pay = paymentChoices.where((c) => c.values.any(_f.payments.contains)).toList();
    return pay.length == 1 ? '$range · ${tr(pay.first.ar, pay.first.en)}' : range;
  }

  /// "Villa" for one pick, "Villa +2" for three, the group's name for none.
  String _groupCaption(List<String> names, String fallback) {
    if (names.isEmpty) return fallback;
    return names.length == 1 ? names.first : '${names.first} +${formatNumber(names.length - 1)}';
  }

  /// Groups in the Filters panel that are narrowing the results. Payment moved into the
  /// Price panel (owner, 2026-10-24).
  int get _moreCount =>
      [_f.segments, _f.deliveries, _f.finishings].where((v) => v.isNotEmpty).length + (_f.withoutOver ? 1 : 0);

  @override
  Widget build(BuildContext context) {
    final locationNames = [
      for (final a in _f.areas) _areaName(a) ?? tr('منطقة', 'Area'),
      for (final c in _f.compounds) _compoundName(c) ?? tr('كمبوند', 'Compound'),
    ];
    // Beds and baths share one button, so its caption reads across both groups.
    final roomNames = [
      for (final b in _f.beds) roomOptionLabel(bedOptions, b),
      for (final b in _f.baths) roomOptionLabel(bathOptions, b),
    ];
    final more = _moreCount;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title ?? tr('الوحدات الموثقة', 'Verified units')),
        actions: const [LangToggleButton()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          /*
            The website's search bar, in Zillow's shape (owner, 2026-10-20): a search field,
            one rounded dropdown button per question, and one solid action at the end, all
            in a row that scrolls sideways. A button that is filtering takes the light forest
            fill and a 2px forest ring and says what it filters by, so the row reads as a
            summary of the search without opening anything.
          */
          child: SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              children: [
                _searchField(),
                _BarButton(
                  caption: _f.trade ? tr('مقايضة', 'Trade') : tr('للبيع', 'For sale'),
                  active: true,
                  onTap: () => _openPanel(_PanelKey.purpose),
                ),
                _BarButton(
                  caption: _priceCaption,
                  active: _f.minPrice != null || _f.maxPrice != null || _f.payments.isNotEmpty,
                  onTap: () => _openPanel(_PanelKey.price),
                ),
                _BarButton(
                  caption: _groupCaption(locationNames, tr('المنطقة', 'Location')),
                  active: locationNames.isNotEmpty,
                  onTap: () => _openPanel(_PanelKey.location),
                ),
                _BarButton(
                  caption: _groupCaption(roomNames, tr('الغرف والحمامات', 'Beds & baths')),
                  active: roomNames.isNotEmpty,
                  onTap: () => _openPanel(_PanelKey.rooms),
                ),
                _BarButton(
                  caption: _groupCaption([for (final t in _f.types) unitTypeLabel(t)], tr('نوع الوحدة', 'Property type')),
                  active: _f.types.isNotEmpty,
                  onTap: () => _openPanel(_PanelKey.type),
                ),
                _BarButton(
                  caption: more == 0 ? tr('فلاتر', 'Filters') : '${tr('فلاتر', 'Filters')} (${formatNumber(more)})',
                  active: more > 0,
                  icon: Icons.tune,
                  onTap: () => _openPanel(_PanelKey.more),
                ),
                // Zillow's "Save search", as what we offer instead: tell us what you want
                // and an advisor finds it.
                Material(
                  color: AqarColors.brand500,
                  borderRadius: BorderRadius.circular(AqarRadius.control),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AqarRadius.control),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OpenRequestScreen())),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Center(
                        child: Text(
                          tr('اطلب وحدة', 'Request a unit'),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: _buildBody(),
    );
  }

  /// Areas and compounds for the search field's suggestions, from [_compounds].
  List<Place> get _places {
    final p = placesFromCompounds(_compounds);
    return [...p.areas, ...p.compounds];
  }

  /// A picked suggestion filters by that place exactly, rather than as free text.
  void _pickPlace(Place p) {
    _qController.clear();
    _qFocus.unfocus();
    final areas = p.isCompound || _f.areas.contains(p.slug) ? _f.areas : [..._f.areas, p.slug];
    final compounds = !p.isCompound || _f.compounds.contains(p.slug) ? _f.compounds : [..._f.compounds, p.slug];
    _setFilters(_f.copyWith(q: '', areas: areas, compounds: compounds));
  }

  /// Keyword search — compound, area or keyword — with as-you-type suggestions for
  /// matching areas and compounds, as on the website. A fixed width, so the buttons after
  /// it stay reachable by scrolling.
  Widget _searchField() {
    final focused = _qFocus.hasFocus;
    void submit() {
      _qFocus.unfocus();
      _setFilters(_f.copyWith(q: _qController.text.trim()));
    }

    return Container(
      width: 230,
      margin: const EdgeInsetsDirectional.only(end: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AqarRadius.control),
        border: Border.all(color: focused ? AqarColors.brand500 : AqarColors.navy300, width: focused ? 2 : 1),
      ),
      child: RawAutocomplete<Place>(
        textEditingController: _qController,
        focusNode: _qFocus,
        displayStringForOption: (p) => p.name,
        optionsBuilder: (v) => v.text.trim().isEmpty ? const <Place>[] : _places.where((p) => p.matches(v.text)).take(8),
        onSelected: _pickPlace,
        optionsViewBuilder: (context, onSelected, options) => Align(
          alignment: AlignmentDirectional.topStart,
          child: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Material(
              elevation: 2,
              color: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AqarRadius.control),
                side: const BorderSide(color: AqarColors.border),
              ),
              clipBehavior: Clip.antiAlias,
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width - 32, maxHeight: 320),
                child: SizedBox(
                  width: 320,
                  child: ListView(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    shrinkWrap: true,
                    children: [for (final p in options) PlaceSuggestionTile(place: p, onTap: () => onSelected(p))],
                  ),
                ),
              ),
            ),
          ),
        ),
        fieldViewBuilder: (context, controller, focusNode, _) => Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focusNode,
                textInputAction: TextInputAction.search,
                // Enter searches the typed words; a suggestion is picked by tapping it.
                onSubmitted: (_) => submit(),
                style: const TextStyle(fontSize: 14, color: AqarColors.ink900),
                decoration: InputDecoration(
                  isCollapsed: true,
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsetsDirectional.only(start: 12),
                  hintText: tr('كمبوند، منطقة أو كلمة', 'Compound, area or keyword'),
                  hintStyle: const TextStyle(fontSize: 14, color: AqarColors.ink400),
                ),
              ),
            ),
            SizedBox(
              width: 38,
              child: IconButton(
                tooltip: tr('ابحث', 'Search'),
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.search, size: 20, color: AqarColors.ink900),
                onPressed: submit,
              ),
            ),
          ],
        ),
      ),
    );
  }

  static const _sorts = {
    'newest': ('الأحدث', 'Newest'),
    'best_value': ('الأفضل مقابل السعر', 'Best value'),
    'price_asc': ('السعر: من الأقل', 'Price: low to high'),
    'price_desc': ('السعر: من الأعلى', 'Price: high to low'),
  };

  /// Count + sort strip above the results, as on the website.
  Widget _resultsHeader() {
    final (ar, en) = _sorts[_sort]!;
    return Row(
      children: [
        Expanded(
          child: Text(
            tr('${formatNumber(_total)} وحدة موثقة', '${formatNumber(_total)} verified units'),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.ink700, fontFeatures: AqarType.tnum),
          ),
        ),
        if (_f.withoutOver)
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 6),
            child: InkWell(
              borderRadius: BorderRadius.circular(4),
              onTap: () => _setFilters(_f.copyWith(withoutOver: false)),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: AqarColors.accent50, borderRadius: BorderRadius.circular(4)),
                child: Text(
                  '${tr('بدون أوفر', 'Without over')} ✕',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AqarColors.accent600),
                ),
              ),
            ),
          ),
        PopupMenuButton<String>(
          initialValue: _sort,
          tooltip: tr('ترتيب', 'Sort'),
          onSelected: (v) {
            setState(() => _sort = v);
            _load(reset: true);
          },
          itemBuilder: (_) => [
            for (final e in _sorts.entries) PopupMenuItem(value: e.key, child: Text(tr(e.value.$1, e.value.$2))),
          ],
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(tr(ar, en), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ink900)),
                const Icon(Icons.keyboard_arrow_down, size: 16, color: AqarColors.ink900),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBody() {
    if (_error != null && _items.isEmpty) {
      return ErrorNotice(
        message: _errorMessage(_error!),
        onRetry: () => _load(reset: true),
      );
    }
    if (_items.isEmpty && _loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items.isEmpty) {
      return EmptyState(
        icon: Icons.search_off,
        title: tr('مفيش وحدات بالفلاتر دي', 'No units match these filters'),
        body: tr(
          'جرّب تشيل فلتر أو اتنين. أو ابعت طلب بالوحدة اللي عايزها وواحد من فريقنا يدوّرلك عليها.',
          'Try removing a filter or two. Or send us a request for the unit you want and someone on our team will look for it.',
        ),
        action: FilledButton(
          onPressed: () => Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const OpenRequestScreen())),
          child: Text(tr('ابعت طلبك', 'Send a request')),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        itemCount: _items.length + 2,
        separatorBuilder: (_, __) => const SizedBox(height: 14),
        itemBuilder: (context, i) {
          if (i == 0) return _resultsHeader();
          if (i == _items.length + 1) {
            if (_loading) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            return Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.only(top: 20),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: AqarColors.border))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr('دي كل الوحدات اللي بالفلاتر دي.', "That's every unit for these filters."),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AqarColors.ink900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    tr(
                      'ابعت طلب بالوحدة اللي عايزها، وواحد من فريقنا يرد عليك بالمتاح خلال 24 ساعة.',
                      'Send a request for the unit you want and someone on our team replies with what fits within 24 hours.',
                    ),
                    style: const TextStyle(fontSize: 13, height: 1.6, color: AqarColors.ink500),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const OpenRequestScreen()),
                    ),
                    child: Text(tr('اطلب وحدة', 'Request a unit')),
                  ),
                ],
              ),
            );
          }

          final listing = _items[i - 1];
          return ListingCardTile(
            listing: listing,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ListingScreen(listing: listing),
              ),
            ),
          );
        },
      ),
    );
  }
}

/* ── Shared pieces ──────────────────────────────────────────────────────── */

enum _PanelKey { purpose, price, location, rooms, type, more }

/// Short money for a button or chip, where a full figure will not fit.
String _short(int n) {
  if (n >= 1000000) return isEn ? '${formatNumber((n / 100000).round() / 10)}M' : '${formatNumber((n / 100000).round() / 10)} مليون';
  if (n >= 1000) return isEn ? '${formatNumber((n / 1000).round())}K' : '${formatNumber((n / 1000).round())} ألف';
  return formatNumber(n);
}

class _Filters {
  const _Filters({
    this.trade = false,
    this.withoutOver = false,
    this.segments = const [],
    this.areas = const [],
    this.compounds = const [],
    this.minPrice,
    this.maxPrice,
    this.beds = const [],
    this.baths = const [],
    this.types = const [],
    this.finishings = const [],
    this.deliveries = const [],
    this.payments = const [],
    this.q = '',
  });

  /// For sale (false) or open to trade (true). Always one of the two — the bar's first
  /// button is never "off".
  final bool trade;
  final bool withoutOver;

  /// Multi-select groups, as the website's facets: an empty list means no restriction.
  final List<String> segments, areas, compounds, beds, baths, types, finishings, deliveries, payments;
  final int? minPrice, maxPrice;
  final String q;

  // The prices take a thunk so "set to null" and "leave as is" stay distinguishable.
  _Filters copyWith({
    bool? trade,
    bool? withoutOver,
    List<String>? segments,
    List<String>? areas,
    List<String>? compounds,
    int? Function()? minPrice,
    int? Function()? maxPrice,
    List<String>? beds,
    List<String>? baths,
    List<String>? types,
    List<String>? finishings,
    List<String>? deliveries,
    List<String>? payments,
    String? q,
  }) =>
      _Filters(
        trade: trade ?? this.trade,
        withoutOver: withoutOver ?? this.withoutOver,
        segments: segments ?? this.segments,
        areas: areas ?? this.areas,
        compounds: compounds ?? this.compounds,
        minPrice: minPrice != null ? minPrice() : this.minPrice,
        maxPrice: maxPrice != null ? maxPrice() : this.maxPrice,
        beds: beds ?? this.beds,
        baths: baths ?? this.baths,
        types: types ?? this.types,
        finishings: finishings ?? this.finishings,
        deliveries: deliveries ?? this.deliveries,
        payments: payments ?? this.payments,
        q: q ?? this.q,
      );
}

/// One rounded dropdown button in the bar.
class _BarButton extends StatelessWidget {
  const _BarButton({required this.caption, required this.active, required this.onTap, this.icon});

  final String caption;
  final bool active;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(AqarRadius.control);
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: Material(
        color: active ? AqarColors.brand50 : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: active
              ? const BorderSide(color: AqarColors.brand500, width: 2)
              : const BorderSide(color: AqarColors.navy300),
        ),
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: 14, end: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[Icon(icon, size: 16, color: AqarColors.ink900), const SizedBox(width: 6)],
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 180),
                  child: Text(
                    caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.keyboard_arrow_down, size: 20, color: AqarColors.ink900),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/* ── Panels ─────────────────────────────────────────────────────────────── */

/// The web bar's dropdown panels as bottom sheets: a grey title strip, the options, and a
/// sticky Apply footer. Each works on a DRAFT and pops it on Apply; dismissing pops null,
/// which discards it.
///
/// Every group is multi-select, as on the website: options OR together within a group,
/// groups AND together, and /api/listings takes each as a repeated query parameter.
class _FilterPanel extends StatefulWidget {
  const _FilterPanel({required this.panel, required this.initial, required this.compounds});

  final _PanelKey panel;
  final _Filters initial;
  final List<Map<String, dynamic>> compounds;

  @override
  State<_FilterPanel> createState() => _FilterPanelState();
}

class _FilterPanelState extends State<_FilterPanel> {
  late _Filters _d = widget.initial;
  late final _min = TextEditingController(text: _fmt(widget.initial.minPrice));
  late final _max = TextEditingController(text: _fmt(widget.initial.maxPrice));
  final _compoundQuery = TextEditingController();

  static const _pricePresets = [3000000, 5000000, 8000000, 12000000, 20000000];

  static String _fmt(int? n) => n == null ? '' : formatNumber(n, ar: false);

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    _compoundQuery.dispose();
    super.dispose();
  }

  void _apply() {
    var d = _d;
    if (widget.panel == _PanelKey.price) {
      var lo = parseAmount(_min.text);
      var hi = parseAmount(_max.text);
      // A reversed pair is a typo, not a request for nothing.
      if (lo != null && hi != null && lo > hi) (lo, hi) = (hi, lo);
      d = d.copyWith(minPrice: () => lo, maxPrice: () => hi);
    }
    Navigator.of(context).pop(d);
  }

  /// Every facet, the price and the text search; the sale/trade choice is kept.
  void _resetAll() => Navigator.of(context).pop(_Filters(trade: _d.trade));

  /* ── Pieces ── */

  Widget _header(String text) => Container(
        width: double.infinity,
        padding: const EdgeInsetsDirectional.fromSTEB(16, 6, 4, 6),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
        child: Row(
          children: [
            Expanded(
              child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
            ),
            IconButton(
              tooltip: tr('إغلاق', 'Close'),
              icon: const Icon(Icons.close, size: 20, color: AqarColors.ink500),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      );

  /// A labelled group of tickable rows, in two columns. [set] gets the new picked list.
  Widget _checkList(String title, Map<String, String> options, List<String> picked, ValueChanged<List<String>> set) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FilterLegend(title),
          TwoColumns(children: [
            for (final e in options.entries)
              FilterCheckRow(label: e.value, value: picked.contains(e.key), onTap: () => setState(() => set(flipValue(picked, e.key)))),
          ]),
        ],
      ),
    );
  }

  Widget _priceInput(bool isMin) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isMin ? tr('من', 'Minimum') : tr('إلى', 'Maximum'),
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ink500),
            ),
            const SizedBox(height: 4),
            // Figures read left to right in both languages, so the currency tag sits on the right.
            Directionality(
              textDirection: TextDirection.ltr,
              child: TextField(
                controller: isMin ? _min : _max,
                keyboardType: TextInputType.number,
                inputFormatters: [AmountInputFormatter()],
                onChanged: (_) => setState(() {}), // re-marks the preset chips
                onSubmitted: (_) => _apply(),
                style: const TextStyle(fontSize: 15, color: AqarColors.ink900, fontFeatures: AqarType.tnum),
                decoration: InputDecoration(
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  hintText: isMin ? tr('بدون حد أدنى', 'No min') : tr('بدون حد أقصى', 'No max'),
                  hintStyle: const TextStyle(fontSize: 14, color: AqarColors.ink400),
                  // A suffix ICON, not suffixText: suffixText only shows once the field has focus.
                  suffixIcon: Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: Text(tr('ج.م', 'EGP'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AqarColors.ink400)),
                  ),
                  suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AqarRadius.control),
                    borderSide: const BorderSide(color: AqarColors.navy300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AqarRadius.control),
                    borderSide: const BorderSide(color: AqarColors.brand500, width: 2),
                  ),
                ),
              ),
            ),
          ],
        ),
      );

  Widget _footer({bool withReset = false}) => Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AqarColors.border)),
        ),
        child: Row(
          children: [
            if (withReset) ...[
              TextButton(
                onPressed: _resetAll,
                style: TextButton.styleFrom(foregroundColor: AqarColors.brand500, padding: const EdgeInsets.symmetric(horizontal: 4)),
                child: Text(tr('مسح كل الفلاتر', 'Reset all filters'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: SizedBox(
                height: 48,
                child: Material(
                  color: AqarColors.brand500,
                  borderRadius: BorderRadius.circular(AqarRadius.control),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AqarRadius.control),
                    onTap: _apply,
                    child: Center(
                      child: Text(
                        tr('تطبيق', 'Apply'),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );

  /* ── Panels ── */

  Widget _purposeBody() {
    // Applies at once, as on the website. Trade units are priced against what they trade
    // for, so a buy price range would empty them: the range starts over.
    Widget option(bool trade, String label) => InkWell(
          onTap: () => Navigator.of(context).pop(_d.copyWith(trade: trade, minPrice: () => null, maxPrice: () => null)),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                Icon(
                  _d.trade == trade ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  size: 20,
                  color: _d.trade == trade ? AqarColors.brand500 : AqarColors.navy300,
                ),
                const SizedBox(width: 12),
                Text(label, style: const TextStyle(fontSize: 15, color: AqarColors.ink900)),
              ],
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          option(false, tr('للبيع', 'For sale')),
          option(true, tr('مقايضة', 'Trade')),
          // A lister who wants to trade says what they want once, and gets matches + alerts.
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 8),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 0)),
                onPressed: () {
                  final nav = Navigator.of(context);
                  nav.pop();
                  openNewTradeRequest(nav.context);
                },
                child: Text(
                  tr('عندك وحدة عايز تبدلها؟ اعمل طلب مقايضة', 'Have a unit to swap? Create a trade request'),
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, decoration: TextDecoration.underline),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _priceBody() {
    final maxNow = parseAmount(_max.text);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _priceInput(true),
              const Padding(padding: EdgeInsets.fromLTRB(8, 0, 8, 14), child: Text('–', style: TextStyle(color: AqarColors.ink400))),
              _priceInput(false),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final p in _pricePresets)
                InkWell(
                  borderRadius: BorderRadius.circular(6),
                  onTap: () => setState(() => _max.text = _fmt(p)),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: maxNow == p ? AqarColors.brand50 : Colors.white,
                      borderRadius: BorderRadius.circular(6),
                      border: maxNow == p
                          ? Border.all(color: AqarColors.brand500, width: 1.5)
                          : Border.all(color: AqarColors.ink200),
                    ),
                    child: Text(
                      tr('حتى ${_short(p)}', 'Up to ${_short(p)}'),
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        fontFeatures: AqarType.tnum,
                        color: maxNow == p ? AqarColors.brand500 : AqarColors.ink700,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 18),
          FilterLegend(tr('طريقة الدفع', 'Payment')),
          PaymentChoiceRow(picked: _d.payments, onChanged: (v) => setState(() => _d = _d.copyWith(payments: v))),
        ],
      ),
    );
  }

  Widget _locationBody() {
    if (widget.compounds.isEmpty) {
      return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
    }
    final places = placesFromCompounds(widget.compounds);
    final areas = {for (final a in places.areas) a.slug: a.name};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _checkList(tr('المنطقة', 'Area'), areas, _d.areas, (v) => _d = _d.copyWith(areas: v)),
        _compoundPicker(places.compounds),
      ],
    );
  }

  /// Compounds, found by typing: picked ones sit on top as chips, the rest narrow as you
  /// type (the website's compound picker).
  Widget _compoundPicker(List<Place> all) {
    final cur = _d.compounds;
    final chosen = [for (final c in all) if (cur.contains(c.slug)) c];
    final q = _compoundQuery.text;
    final found = all.where((c) => !cur.contains(c.slug) && c.matches(q)).take(q.trim().isEmpty ? 12 : 30).toList();
    void flip(Place c) => setState(() => _d = _d.copyWith(compounds: flipValue(cur, c.slug)));
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FilterLegend(tr('الكمبوند', 'Compound')),
          TextField(
            controller: _compoundQuery,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(fontSize: 14, color: AqarColors.ink900),
            decoration: InputDecoration(
              isDense: true,
              hintText: tr('اكتب اسم الكمبوند', 'Type a compound name'),
              hintStyle: const TextStyle(fontSize: 14, color: AqarColors.ink400),
              prefixIcon: const Icon(Icons.search, size: 18, color: AqarColors.ink400),
              suffixIcon: q.isEmpty
                  ? null
                  : IconButton(
                      tooltip: tr('مسح', 'Clear'),
                      icon: const Icon(Icons.close, size: 16, color: AqarColors.ink400),
                      onPressed: () => setState(_compoundQuery.clear),
                    ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AqarRadius.control),
                borderSide: const BorderSide(color: AqarColors.navy300),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AqarRadius.control),
                borderSide: const BorderSide(color: AqarColors.brand500, width: 2),
              ),
            ),
          ),
          if (chosen.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [for (final c in chosen) PlaceChip(place: c, onRemove: () => flip(c))]),
          ],
          const SizedBox(height: 4),
          for (final c in found) FilterCheckRow(label: c.name, value: false, onTap: () => flip(c)),
          if (q.trim().isNotEmpty && found.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(tr('مفيش كمبوند بالاسم ده', 'No compound by that name'), style: const TextStyle(fontSize: 13, color: AqarColors.ink400)),
            ),
        ],
      ),
    );
  }

  Widget _moreBody() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FilterCheckRow(
                label: tr('وحدات بدون أوفر برايس', 'Units without over price'),
                value: _d.withoutOver,
                onTap: () => setState(() => _d = _d.copyWith(withoutOver: !_d.withoutOver)),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.only(start: 30, bottom: 4),
                child: Text(
                  tr('بتتباع بسعر العقد الأصلي، من غير زيادة.', 'Sold at the original contract price, nothing on top.'),
                  style: const TextStyle(fontSize: 12, color: AqarColors.ink500),
                ),
              ),
            ],
          ),
        ),
        _checkList(
          tr('السوق', 'Market'),
          {for (final s in Segment.values) segmentSlug(s): segmentLabel(s)},
          _d.segments,
          (v) => _d = _d.copyWith(segments: v),
        ),
        _checkList(
          tr('الاستلام', 'Delivery'),
          {'ready': tr('استلام فوري', 'Ready to move'), 'under_construction': tr('تحت الإنشاء', 'Under construction')},
          _d.deliveries,
          (v) => _d = _d.copyWith(deliveries: v),
        ),
        _checkList(
          tr('التشطيب', 'Finishing'),
          {for (final f in const ['core_shell', 'semi_finished', 'fully_finished', 'furnished']) f: finishingLabel(f)},
          _d.finishings,
          (v) => _d = _d.copyWith(finishings: v),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final (String title, Widget body, Widget? footer) = switch (widget.panel) {
      _PanelKey.purpose => (tr('نوع العرض', 'Listing type'), _purposeBody(), null),
      _PanelKey.price => (tr('نطاق السعر', 'Price range'), _priceBody(), _footer()),
      _PanelKey.location => (tr('المنطقة والكمبوند', 'Area & compound'), _locationBody(), _footer()),
      _PanelKey.rooms => (
          tr('الغرف والحمامات', 'Beds & baths'),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              children: [
                RoomPillRow(
                  title: tr('غرف النوم', 'Bedrooms'),
                  options: bedOptions,
                  picked: _d.beds,
                  onChanged: (v) => setState(() => _d = _d.copyWith(beds: v)),
                ),
                const SizedBox(height: 16),
                RoomPillRow(
                  title: tr('الحمامات', 'Bathrooms'),
                  options: bathOptions,
                  picked: _d.baths,
                  onChanged: (v) => setState(() => _d = _d.copyWith(baths: v)),
                ),
              ],
            ),
          ),
          _footer(),
        ),
      _PanelKey.type => (
          tr('نوع الوحدة', 'Property type'),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: UnitTypeSections(picked: _d.types, onChanged: (v) => setState(() => _d = _d.copyWith(types: v))),
          ),
          _footer(),
        ),
      _PanelKey.more => (tr('فلاتر أكتر', 'More filters'), _moreBody(), _footer(withReset: true)),
    };
    final mq = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: mq.size.height * 0.85),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _header(title),
              Flexible(child: SingleChildScrollView(child: Padding(padding: const EdgeInsets.only(bottom: 16), child: body))),
              if (footer != null) footer,
            ],
          ),
        ),
      ),
    );
  }
}
