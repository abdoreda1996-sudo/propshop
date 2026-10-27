import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';

/// The back office inside the app, for admins, reviewers and advisors.
///
/// Everything queue-specific (filters, which bulk actions this role may run, who can be
/// assigned) comes from the server (`GET /api/admin/queues/[queue]`), and actions go to the
/// website's bulk endpoint, so the app and the website can't disagree about the rules.

String _l(dynamic label) {
  if (label is Map) return (isEn ? label['en'] : label['ar'])?.toString() ?? '';
  return label?.toString() ?? '';
}

class _QueueMeta {
  const _QueueMeta(this.ar, this.en);
  final String ar;
  final String en;
}

const _queues = <String, _QueueMeta>{
  'verification': _QueueMeta('طابور التوثيق', 'Verification queue'),
  'requests': _QueueMeta('طابور المستشارين', 'Advisor queue'),
  'viewings': _QueueMeta('طلبات المعاينة', 'Viewing requests'),
  'bookings': _QueueMeta('حجوزات الجولات', 'Tour bookings'),
  'trades': _QueueMeta('المقايضات', 'Trades'),
  'offers': _QueueMeta('العروض', 'Offers'),
  'reports': _QueueMeta('البلاغات', 'Reports'),
  'listings': _QueueMeta('كل الإعلانات', 'All listings'),
  'users': _QueueMeta('المستخدمون', 'Users'),
};

class StaffHomeScreen extends StatefulWidget {
  const StaffHomeScreen({super.key});

  @override
  State<StaffHomeScreen> createState() => _StaffHomeScreenState();
}

class _StaffHomeScreenState extends State<StaffHomeScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Api>().staffQueues();
  }

  void _reload() => setState(() => _future = context.read<Api>().staffQueues());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('لوحة فريق العمل', 'Team panel')), actions: const [LangToggleButton()]),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorNotice(message: tr('مش قادرين نحمّل اللوحة.', "Couldn't load the panel."), onRetry: _reload);
          }
          final queues = ((snap.data!['queues'] as List?) ?? const []).cast<String>();
          final counts = (snap.data!['counts'] as Map?) ?? const {};
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              itemCount: queues.length,
              separatorBuilder: (_, _) => const SizedBox.shrink(),
              itemBuilder: (context, i) {
                final q = queues[i];
                final meta = _queues[q] ?? _QueueMeta(q, q);
                final n = counts[q];
                return PlainRow(
                  label: tr(meta.ar, meta.en),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CountTag(n is num ? n.toInt() : 0, urgent: true),
                      Icon(isEn ? Icons.chevron_right : Icons.chevron_left, size: 18, color: AqarColors.ink400),
                    ],
                  ),
                  onTap: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => StaffQueueScreen(queue: q, title: tr(meta.ar, meta.en))),
                    );
                    _reload();
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

/// One queue: paged list, filters, select-all / select-some, bulk actions, assign-to.
class StaffQueueScreen extends StatefulWidget {
  const StaffQueueScreen({super.key, required this.queue, required this.title});

  final String queue;
  final String title;

  @override
  State<StaffQueueScreen> createState() => _StaffQueueScreenState();
}

class _StaffQueueScreenState extends State<StaffQueueScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true;
  bool _busy = false;
  int _page = 1;
  final Map<String, String> _filters = {};
  final Set<String> _selected = {};

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
      final d = await context.read<Api>().staffQueue(widget.queue, page: _page, filters: _filters);
      if (!mounted) return;
      final ids = ((d['items'] as List?) ?? const []).map((e) => (e as Map)['id'] as String).toSet();
      setState(() {
        _data = d;
        // Selection is per page: anything no longer listed drops out.
        _selected.retainAll(ids);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _items =>
      ((_data?['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
  List<Map<String, dynamic>> get _actions =>
      ((_data?['actions'] as List?) ?? const []).cast<Map<String, dynamic>>();
  Map<String, dynamic>? get _assign => _data?['assign'] as Map<String, dynamic>?;
  String? get _entity => _data?['entity'] as String?;
  bool get _selectable => _entity != null && (_actions.isNotEmpty || _assign != null);

  int get _total => (_data?['total'] as num?)?.toInt() ?? 0;
  int get _pageSize => (_data?['pageSize'] as num?)?.toInt() ?? 20;
  int get _pages => _total == 0 ? 1 : ((_total + _pageSize - 1) ~/ _pageSize);

  void _goTo(int page) {
    _page = page;
    _selected.clear();
    _load();
  }

  Future<String?> _askReason(String title) async {
    final c = TextEditingController();
    final r = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: c,
          autofocus: true,
          maxLines: 3,
          maxLength: 500,
          decoration: InputDecoration(labelText: tr('السبب', 'Reason')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('رجوع', 'Back'))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, c.text.trim()),
            child: Text(tr('تأكيد', 'Confirm')),
          ),
        ],
      ),
    );
    return (r == null || r.isEmpty) ? null : r;
  }

  Future<bool> _confirm(String label) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(label),
        content: Text(tr('على ${_selected.length} عنصر. متأكد؟', 'On ${_selected.length} items. Are you sure?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('رجوع', 'Back'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('تأكيد', 'Confirm'))),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _run(Map<String, dynamic> action) async {
    final label = _l(action['label']);
    String? reason;
    if (action['needsReason'] == true) {
      reason = await _askReason(label);
      if (reason == null) return;
    } else if (!await _confirm(label)) {
      return;
    }
    await _send(action: action['key'] as String, reason: reason);
  }

  Future<void> _pickAssignee() async {
    final staff = ((_assign?['staff'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final picked = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(_l(_assign?['label']), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            ListTile(
              title: Text(tr('إلغاء الإسناد', 'Unassign')),
              onTap: () => Navigator.pop(ctx, false),
            ),
            for (final s in staff)
              ListTile(
                title: Text(s['fullName']?.toString() ?? ''),
                subtitle: Text(s['role']?.toString() ?? ''),
                onTap: () => Navigator.pop(ctx, s['id'] as String),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    await _send(action: 'assign', assign: true, staffId: picked is String ? picked : null);
  }

  Future<void> _send({required String action, String? reason, bool assign = false, String? staffId}) async {
    setState(() => _busy = true);
    try {
      final r = await context.read<Api>().staffBulk(
        entity: _entity!,
        action: action,
        ids: _selected.toList(),
        reason: reason,
        assign: assign,
        staffId: staffId,
      );
      if (!mounted) return;
      final done = r['done'] ?? 0;
      final skipped = ((r['skipped'] as List?) ?? const []).cast<Map>();
      final reasons = skipped.map((s) => s['reason']).where((x) => x != null && x != '').toSet().join('، ');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          skipped.isEmpty
              ? tr('اتنفذ على $done', 'Done on $done')
              : tr('اتنفذ على $done، واتخطى ${skipped.length} ($reasons)', 'Done on $done, skipped ${skipped.length} ($reasons)'),
        ),
      ));
      _selected.clear();
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('مااتنفذش: ${e.code}', 'Not done: ${e.code}'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openFilters() async {
    final filters = ((_data?['filters'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final draft = Map<String, String>.from(_filters);
    final applied = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _FilterSheet(filters: filters, initial: draft),
    );
    if (applied == null) return;
    _filters
      ..clear()
      ..addAll(applied);
    _goTo(1);
  }

  @override
  Widget build(BuildContext context) {
    final activeFilters = _filters.values.where((v) => v.isNotEmpty).length;
    final allSelected = _items.isNotEmpty && _selected.length == _items.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: tr('الفلاتر', 'Filters'),
            onPressed: _data == null ? null : _openFilters,
            icon: Badge(
              isLabelVisible: activeFilters > 0,
              label: Text('$activeFilters'),
              child: const Icon(Icons.filter_list),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _selected.isEmpty ? null : _bulkBar(),
      body: _error != null && _data == null
          ? ErrorNotice(message: tr('مش قادرين نحمّل القائمة ($_error).', "Couldn't load the list ($_error)."), onRetry: _load)
          : _data == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                children: [
                  Row(
                    children: [
                      if (_selectable && _items.isNotEmpty) ...[
                        Checkbox(
                          tristate: true,
                          value: allSelected ? true : (_selected.isEmpty ? false : null),
                          onChanged: _busy
                              ? null
                              : (_) => setState(() {
                                  if (allSelected) {
                                    _selected.clear();
                                  } else {
                                    _selected.addAll(_items.map((e) => e['id'] as String));
                                  }
                                }),
                        ),
                        Text(tr('اختار كل الصفحة', 'Select whole page')),
                      ],
                      const Spacer(),
                      Text(
                        tr('$_total نتيجة', '$_total results'),
                        style: const TextStyle(fontSize: 13, color: AqarColors.textMuted),
                      ),
                    ],
                  ),
                  if (activeFilters > 0)
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(
                        onPressed: () {
                          _filters.clear();
                          _goTo(1);
                        },
                        child: Text(tr('امسح الفلاتر ($activeFilters)', 'Clear filters ($activeFilters)')),
                      ),
                    ),
                  if (_loading) const LinearProgressIndicator(minHeight: 2),
                  if (_items.isEmpty && !_loading)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 32, 4, 0),
                      child: Text(
                        activeFilters > 0
                            ? tr('مافيش حاجة بالفلاتر دي. جرّب تمسح فلتر.', 'Nothing matches these filters. Try clearing one.')
                            : tr('الطابور فاضي.', 'This queue is empty.'),
                        style: const TextStyle(fontSize: 14, color: AqarColors.ink500),
                      ),
                    ),
                  for (final item in _items) _ItemCard(
                    item: item,
                    selectable: _selectable,
                    selected: _selected.contains(item['id']),
                    onToggle: _busy
                        ? null
                        : () => setState(() {
                            final id = item['id'] as String;
                            _selected.contains(id) ? _selected.remove(id) : _selected.add(id);
                          }),
                  ),
                  if (_pages > 1) _pager(),
                ],
              ),
            ),
    );
  }

  Widget _pager() => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          tooltip: tr('السابق', 'Previous'),
          onPressed: _page > 1 && !_loading ? () => _goTo(_page - 1) : null,
          icon: Icon(isEn ? Icons.chevron_left : Icons.chevron_right),
        ),
        Text(tr('صفحة $_page من $_pages', 'Page $_page of $_pages')),
        IconButton(
          tooltip: tr('التالي', 'Next'),
          onPressed: _page < _pages && !_loading ? () => _goTo(_page + 1) : null,
          icon: Icon(isEn ? Icons.chevron_right : Icons.chevron_left),
        ),
      ],
    ),
  );

  // A white bar with a hairline. The old near-black bar made the outlined theme buttons
  // (forest on ink) unreadable, and its danger actions came out green.
  Widget _bulkBar() => SafeArea(
    child: Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AqarColors.ink200)),
      ),
      child: Row(
        children: [
          Text(
            tr('${_selected.length} محدد', '${_selected.length} selected'),
            style: const TextStyle(fontWeight: FontWeight.w700, fontFeatures: AqarType.tnum),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  if (_assign != null)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                        onPressed: _busy ? null : _pickAssignee,
                        child: Text(_l(_assign!['label'])),
                      ),
                    ),
                  for (final a in _actions)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: a['danger'] == true
                          ? OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size(0, 40),
                                foregroundColor: AqarColors.danger,
                                side: const BorderSide(color: AqarColors.dangerBorder),
                              ),
                              onPressed: _busy ? null : () => _run(a),
                              child: Text(_l(a['label'])),
                            )
                          : FilledButton(
                              style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                              onPressed: _busy ? null : () => _run(a),
                              child: Text(_l(a['label'])),
                            ),
                    ),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: tr('إلغاء التحديد', 'Clear selection'),
            onPressed: _busy ? null : () => setState(_selected.clear),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    ),
  );
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item, required this.selectable, required this.selected, this.onToggle});

  final Map<String, dynamic> item;
  final bool selectable;
  final bool selected;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final badges = ((item['badges'] as List?) ?? const []).cast<Map>();
    final assignee = item['assignee'] as String?;
    return Material(
      color: selected ? AqarColors.ink50 : Colors.white,
      child: InkWell(
        onTap: selectable ? onToggle : null,
        child: Container(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
          padding: const EdgeInsets.fromLTRB(0, 10, 4, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (selectable)
                Checkbox(value: selected, onChanged: onToggle == null ? null : (_) => onToggle!())
              else
                const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['ref']?.toString() ?? '',
                      style: const TextStyle(fontSize: 12, color: AqarColors.textMuted, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      item['title']?.toString() ?? '',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AqarColors.ink900),
                    ),
                    if ((item['subtitle'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(item['subtitle'].toString(), style: const TextStyle(fontSize: 13, color: AqarColors.ink700)),
                    ],
                    if (badges.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final b in badges)
                            b['tone'] == 'danger'
                                ? AqarBadge.danger(_l(b['text']))
                                : b['tone'] == 'ok'
                                ? AqarBadge.verified(_l(b['text']))
                                : AqarBadge.neutral(_l(b['text'])),
                        ],
                      ),
                    ],
                    if (item.containsKey('assignee')) ...[
                      const SizedBox(height: 8),
                      Text(
                        assignee == null ? tr('مش مسندة لحد', 'Unassigned') : tr('مع $assignee', 'With $assignee'),
                        style: const TextStyle(fontSize: 12, color: AqarColors.textMuted),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.filters, required this.initial});

  final List<Map<String, dynamic>> filters;
  final Map<String, String> initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late final Map<String, String> _values = Map.of(widget.initial);
  final Map<String, TextEditingController> _text = {};

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            Text(tr('الفلاتر', 'Filters'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            for (final f in widget.filters) ...[
              if (f['kind'] == 'search')
                TextField(
                  controller: _text.putIfAbsent(
                    f['name'] as String,
                    () => TextEditingController(text: _values[f['name']] ?? ''),
                  ),
                  decoration: InputDecoration(labelText: _l(f['label'])),
                  onChanged: (v) => _values[f['name'] as String] = v.trim(),
                )
              else
                DropdownButtonFormField<String>(
                  initialValue: (_values[f['name']] ?? '').isEmpty ? '' : _values[f['name']],
                  isExpanded: true,
                  decoration: InputDecoration(labelText: _l(f['label'])),
                  items: [
                    DropdownMenuItem(value: '', child: Text(tr('الكل', 'All'))),
                    for (final o in ((f['options'] as List?) ?? const []).cast<Map>())
                      DropdownMenuItem(value: o['value'] as String, child: Text(_l(o['label']), overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _values[f['name'] as String] = v ?? ''),
                ),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, <String, String>{}),
                    child: Text(tr('امسح الكل', 'Clear all')),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context, Map<String, String>.from(_values)..removeWhere((_, v) => v.isEmpty)),
                    child: Text(tr('طبّق', 'Apply')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
