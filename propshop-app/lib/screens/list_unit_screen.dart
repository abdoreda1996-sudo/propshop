import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/filter_controls.dart' show AmountInputFormatter;
import 'capture_screen.dart';
import 'document_camera_screen.dart';
import 'login_screen.dart';
import 'verify_identity_screen.dart';

/// LIST YOUR UNIT, the app's twin of the website's ListingWizard.
///
/// Same server rules as the web, in six short steps: type and place, size and rooms,
/// price and payment (the draft is created there, with all three at once, because
/// /api/listings/draft takes them together), ownership document, photos taken in the app
/// with GPS, then review and submit for verification. The publish gate is the server's
/// (`/api/listings/[id]/validate`); this screen only shows what it says.
///
/// Before step one: sign in, and verify identity once (trust level 1). The web gates the
/// same way at /dashboard/listings/new.
class ListUnitScreen extends StatefulWidget {
  const ListUnitScreen({super.key, this.resumeListingId, this.resumeReference});

  /// Resume an existing draft (from My listings) instead of starting a new one. The
  /// screen opens on Review, which shows what still blocks publication and links back to
  /// the document and photo steps, with the photo checklist ticked from the draft's media.
  /// The unit steps are not reachable on a resumed draft: there is no endpoint to read or
  /// edit the unit.
  final String? resumeListingId;
  final String? resumeReference;

  @override
  State<ListUnitScreen> createState() => _ListUnitScreenState();
}

class _Compound {
  _Compound(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get areaId => (j['areaId'] ?? '') as String;
  String get name => (isEn ? j['nameEn'] : j['nameAr']) as String? ?? '';
  String get areaName => ((j['area'] as Map?)?[isEn ? 'nameEn' : 'nameAr'] as String?) ?? '';
  num? get minSize => j['minSizeSqm'] as num?;
  num? get maxSize => j['maxSizeSqm'] as num?;
  List<String> get unitTypes => ((j['unitTypes'] as List?) ?? const []).cast<String>();
}

/// Rooms the server already has photos for, from GET /api/listings/[id]/media.
///
/// Only in-app and photographer shots count toward the checklist, as in the publish gate;
/// a gallery upload in the living room does not tick "living".
List<String> coveredRoomsFromMedia(Map<String, dynamic>? j) {
  final media = ((j?['media'] as List?) ?? const []).whereType<Map>();
  final rooms = {
    for (final m in media)
      if ((m['source'] == 'in_app' || m['source'] == 'photographer') && m['room'] is String) m['room'] as String,
  };
  return requiredRooms.where(rooms.contains).toList();
}

/// The fallback when the media call fails: rooms read from the publish gate.
///
/// The gate's `rooms_missing` block names every
/// required room still without an in-app photo ("Missing photos for: living, kitchen"),
/// so the covered rooms are the rest. No such block means all of them are covered.
List<String> coveredRoomsFromValidation(Map<String, dynamic>? v) {
  if (v == null) return const [];
  final blocks = ((v['blocks'] as List?) ?? const []).whereType<Map>();
  final missing = blocks.where((b) => b['code'] == 'rooms_missing').firstOrNull;
  if (missing == null) return [...requiredRooms];
  final msg = (missing['messageEn'] ?? '') as String;
  final listed = msg.contains(':') ? msg.substring(msg.indexOf(':') + 1) : msg;
  final missingRooms = listed.split(',').map((r) => r.trim()).toSet();
  return requiredRooms.where((r) => !missingRooms.contains(r)).toList();
}

/// "٣" and "3" are the same number in every field here.
String westernDigits(String raw) => raw.split('').map((ch) {
      final c = ch.codeUnitAt(0);
      if (c >= 0x0660 && c <= 0x0669) return String.fromCharCode(0x30 + c - 0x0660);
      if (c >= 0x06F0 && c <= 0x06F9) return String.fromCharCode(0x30 + c - 0x06F0);
      return ch;
    }).join();

class _ListUnitScreenState extends State<ListUnitScreen> {
  // 0 type and place, 1 size and rooms, 2 price and payment, 3 ownership, 4 photos, 5 review
  static const _ownershipStep = 3;
  static const _photosStep = 4;
  static const _reviewStep = 5;
  int _step = 0;
  String? _listingId;
  String? _reference;
  bool _busy = false;
  String? _error;
  bool _submitted = false;

  /// The unit steps were filled in on this screen (not a resumed draft), so Back from the
  /// document step can show them again. Once the draft exists they are read-only except
  /// the price and "without over", which the server lets a draft change.
  bool _unitKnown = false;
  bool get _unitSaved => _listingId != null;
  num? _savedPrice;
  bool _savedWithoutOver = false;

  // steps 0 to 2
  List<_Compound> _compounds = const [];
  _Compound? _compound;
  String _type = 'apartment';
  String _finishing = 'fully_finished';
  String _delivery = 'ready';
  final String _purpose = 'sale';
  // "بدون أوفر": sold at the original contract price, no premium on top (owner, 2026-10-11).
  bool _withoutOver = false;
  String _payment = 'cash';
  final _beds = TextEditingController(text: '3');
  final _baths = TextEditingController(text: '2');
  final _size = TextEditingController();
  final _floor = TextEditingController();
  final _building = TextEditingController();
  final _unitNo = TextEditingController();
  final _price = TextEditingController();

  // step 3
  String _docType = 'contract';
  final List<DocImage> _docPages = [];
  bool _docSent = false;

  // step 4
  List<String> _rooms = const [];

  // step 5
  Map<String, dynamic>? _validation;

  @override
  void initState() {
    super.initState();
    if (widget.resumeListingId != null) {
      _listingId = widget.resumeListingId;
      _reference = widget.resumeReference;
      WidgetsBinding.instance.addPostFrameCallback((_) => _review());
    } else {
      _loadCompounds();
    }
  }

  @override
  void dispose() {
    for (final c in [_beds, _baths, _size, _floor, _building, _unitNo, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadCompounds() async {
    try {
      final j = await context.read<Api>().compounds();
      if (!mounted) return;
      setState(() => _compounds = ((j['compounds'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(_Compound.new)
          .toList()
        ..sort((a, b) => a.areaName.compareTo(b.areaName) != 0 ? a.areaName.compareTo(b.areaName) : a.name.compareTo(b.name)));
    } on ApiException {
      if (mounted) setState(() => _error = tr('مش قادرين نحمّل الكمبوندات.', "We couldn't load the compounds."));
    }
  }

  num? _n(TextEditingController c) {
    final t = westernDigits(c.text).replaceAll(RegExp(r'[^0-9.]'), '');
    return t.isEmpty ? null : num.tryParse(t);
  }

  String _draftError(ApiException e) {
    switch (e.code) {
      case 'duplicate_unit':
        return tr('الوحدة دي معروضة بالفعل (${e.body?['existingReference'] ?? ''}). مينفعش يبقى فيه إعلانين لنفس الوحدة.',
            'This unit is already listed (${e.body?['existingReference'] ?? ''}). One unit, one listing.');
      case 'cap_reached':
        return tr('وصلت للحد الأقصى من الإعلانات النشطة (٣).', 'You have reached the limit of active listings (3).');
      case 'blocked':
        return tr('الحساب موقوف.', 'This account is suspended.');
      case 'invalid_fields':
        final f = ((e.body?['fields'] as List?) ?? const []).join(', ');
        return tr('راجع البيانات: $f', 'Check these fields: $f');
      default:
        return tr('حصلت مشكلة (${e.code}).', 'Something went wrong (${e.code}).');
    }
  }

  /// The step before this one, or null where there is none to show: the first step, and
  /// the document step of a resumed draft (its unit lives on the server only).
  int? get _prevStep {
    if (_step == 0) return null;
    if (_step == _ownershipStep && !_unitKnown) return null;
    return _step - 1;
  }

  void _goBack() {
    final p = _prevStep;
    if (p == null) return;
    setState(() {
      _step = p;
      _error = null;
    });
  }

  /// "Next" on the unit steps. Each checks only its own fields; the price step creates the
  /// draft, or saves a changed price on one that already exists.
  Future<void> _nextUnitStep() async {
    String? missing;
    if (_step == 0 && _compound == null) missing = tr('اختار الكمبوند.', 'Choose the compound.');
    if (_step == 1 && _n(_size) == null) missing = tr('اكتب المساحة.', 'Enter the size.');
    if (_step == 2 && _n(_price) == null) missing = tr('اكتب السعر.', 'Enter the price.');
    if (missing != null) {
      setState(() => _error = missing);
      return;
    }
    if (_step < 2) {
      setState(() {
        _step++;
        _error = null;
      });
      return;
    }
    if (_unitSaved) return _savePrice();
    return _createDraft();
  }

  Future<void> _savePrice() async {
    if (_n(_price) == _savedPrice && _withoutOver == _savedWithoutOver) {
      setState(() {
        _step = _ownershipStep;
        _error = null;
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().updateDraft(_listingId!, {'price': _n(_price), 'withoutOver': _withoutOver});
      if (!mounted) return;
      setState(() {
        _savedPrice = _n(_price);
        _savedWithoutOver = _withoutOver;
        _step = _ownershipStep;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _draftError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createDraft() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await context.read<Api>().createDraft({
        'compoundId': _compound!.id,
        'areaId': _compound!.areaId,
        'type': _type,
        'bedrooms': _n(_beds) ?? 0,
        'bathrooms': _n(_baths) ?? 0,
        'sizeSqm': _n(_size),
        'floor': _n(_floor),
        'building': _building.text.trim().isEmpty ? null : _building.text.trim(),
        'unitNumber': _unitNo.text.trim().isEmpty ? null : _unitNo.text.trim(),
        'finishing': _finishing,
        'deliveryStatus': _delivery,
        'purpose': _purpose,
        'withoutOver': _withoutOver,
        'price': _n(_price),
        'paymentType': _payment,
      });
      if (!mounted) return;
      setState(() {
        _listingId = r['listingId'] as String?;
        _reference = r['reference'] as String?;
        _unitKnown = true;
        _savedPrice = _n(_price);
        _savedWithoutOver = _withoutOver;
        _step = _ownershipStep;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _draftError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addDocPage() async {
    final img = await takeDocumentPhoto(context,
        title: tr('مستند الملكية', 'Ownership document'),
        hint: tr('صوّر الصفحة اللي فيها اسمك وبيانات الوحدة، واضحة ومن غير انعكاس.', 'Photograph the page with your name and the unit details. Sharp, no glare.'));
    if (img != null && mounted) setState(() => _docPages.add(img));
  }

  /// "Next" on the document step: send the new pages, or move on when the server already
  /// has a document and nothing new was photographed.
  Future<void> _nextFromDoc() async {
    if (_docPages.isEmpty) {
      setState(() {
        _step = _photosStep;
        _error = null;
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().uploadOwnershipDoc(_listingId!, type: _docType, images: _docPages);
      if (!mounted) return;
      setState(() {
        _docSent = true;
        _docPages.clear();
        _step = _photosStep;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error = e.code == 'extraction_failed'
            ? tr('مش قادرين نقرأ المستند. صوّره تاني في مكان منوّر.', 'We could not read the document. Retake it in good light.')
            : tr('حصلت مشكلة (${e.code}).', 'Something went wrong (${e.code}).'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _takePhotos() async {
    final rooms = await Navigator.of(context).push<List<String>>(
      MaterialPageRoute(builder: (_) => CaptureScreen(listingId: _listingId!, capturedRooms: _rooms)),
    );
    if (rooms != null && mounted) setState(() => _rooms = rooms);
  }

  Future<void> _review() async {
    setState(() {
      _busy = true;
      _error = null;
      _step = _reviewStep;
    });
    final api = context.read<Api>();
    // The draft's photos and the gate, side by side; the photos decide the checklist.
    final mediaCall = api.listingMedia(_listingId!).then<Map<String, dynamic>?>((m) => m, onError: (_) => null);
    Map<String, dynamic>? v;
    try {
      v = await api.validateListing(_listingId!);
      if (mounted) setState(() => _applyValidation(v!));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = tr('حصلت مشكلة (${e.code}).', 'Something went wrong (${e.code}).'));
    }
    final media = await mediaCall;
    if (!mounted) return;
    setState(() {
      // Fallback when the media call failed: the rooms the gate says are still missing.
      final covered = media != null ? coveredRoomsFromMedia(media) : coveredRoomsFromValidation(v);
      _rooms = {..._rooms, ...covered}.toList();
      _busy = false;
    });
  }

  /// What the gate says is already on the server: a resumed draft's document counts as
  /// sent. (Its photos come from the media call in [_review].)
  void _applyValidation(Map<String, dynamic> v) {
    _validation = v;
    final codes = ((v['blocks'] as List?) ?? const []).whereType<Map>().map((b) => b['code']).toSet();
    if (!codes.contains('ownership_doc_missing')) _docSent = true;
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().submitListing(_listingId!);
      if (!mounted) return;
      setState(() => _submitted = true);
      context.read<SessionController>().refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      final v = e.body?['validation'];
      setState(() {
        if (v is Map<String, dynamic>) _applyValidation(v);
        _error = tr('فيه حاجات لازم تتظبط قبل النشر.', 'Some things must be fixed before publishing.');
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    if (!session.isSignedIn) {
      return _gate(
        title: tr('سجّل دخولك الأول', 'Sign in first'),
        body: tr('عشان تعرض وحدتك لازم يكون عندك حساب.', 'You need an account to list a unit.'),
        action: FilledButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
          child: Text(tr('تسجيل الدخول', 'Sign in')),
        ),
      );
    }
    if (session.trustLevel < 1) {
      return _gate(
        title: tr('وثّق هويتك الأول', 'Verify your identity first'),
        body: tr(
          'قبل ما تعرض وحدة بنتأكد من بطاقتك مرة واحدة، وبعدين مستند ملكية الوحدة. ده اللي بيخلّي كل إعلان موثوق ومن غير سماسرة.',
          'Before listing we verify your national ID once, then the unit\'s ownership document. That is what keeps every listing trustworthy and broker-free.',
        ),
        action: FilledButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VerifyIdentityScreen())),
          child: Text(tr('وثّق هويتك', 'Verify identity')),
        ),
      );
    }
    if (_submitted) {
      return _gate(
        title: tr('إعلانك اتبعت للمراجعة', 'Your listing was sent for review'),
        // "بندفع" read as "we pay"; the fee is the owner's, on sale.
        body: tr(
          'رقم الإعلان $_reference. فريق التوثيق هيراجعه، وأول ما يتنشر المشترين هيشوفوه. نشر الإعلان مجاني، والرسم بيتدفع بس لما الوحدة تتباع.',
          'Listing $_reference. The verification team will review it, and buyers will see it once it is published. Listing is free; the fee is due only when the unit sells.',
        ),
        action: FilledButton(onPressed: () => Navigator.of(context).pop(), child: Text(tr('تمام', 'Done'))),
      );
    }

    final titles = [
      // Word for word the website's ListingWizard step titles.
      tr('الكمبوند والنوع', 'Compound and type'),
      tr('المساحة والتفاصيل', 'Size and details'),
      tr('السعر والدفع', 'Price and payment'),
      tr('إثبات الملكية', 'Ownership proof'),
      tr('الصور', 'Photos'),
      tr('المراجعة والنشر', 'Review and publish'),
    ];
    // The phone's back gesture walks the steps too, and only leaves from the first one.
    return PopScope(
      canPop: _prevStep == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_busy) _goBack();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_reference == null ? tr('اعرض وحدتك', 'List your unit') : '${tr('اعرض وحدتك', 'List your unit')} · $_reference'),
          actions: const [LangToggleButton()],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr('خطوة ${_step + 1} من ${titles.length}: ${titles[_step]}', 'Step ${_step + 1} of ${titles.length}: ${titles[_step]}'),
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      for (var i = 0; i < titles.length; i++)
                        Expanded(
                          child: Container(
                            height: 2,
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            color: i <= _step ? AqarColors.navy700 : AqarColors.ink200,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(child: ListView(padding: const EdgeInsets.all(16), children: [_stepBody(), if (_error != null) _errorBox(_error!)])),
          ],
        ),
      ),
    );
  }

  Widget _gate({required String title, required String body, Widget? action}) => Scaffold(
        appBar: AppBar(title: Text(tr('اعرض وحدتك', 'List your unit')), actions: const [LangToggleButton()]),
        body: EmptyState(title: title, body: body, action: action),
      );

  Widget _errorBox(String msg) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Text(msg, style: const TextStyle(fontSize: 13.5, height: 1.5, color: AqarColors.danger, fontWeight: FontWeight.w600)),
      );

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 8),
        child: Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AqarColors.ink900)),
      );

  /// Chips; [locked] shows the choice without letting it change (a saved draft's unit).
  Widget _chips(List<(String, String)> options, String value, ValueChanged<String> onPick, {bool locked = false}) => Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final (k, label) in options)
            ChoiceChip(label: Text(label), selected: value == k, onSelected: locked ? null : (_) => onPick(k)),
        ],
      );

  Widget _field(String label, TextEditingController c, {bool number = true, String? helper, bool locked = false}) => TextField(
        controller: c,
        enabled: !locked,
        keyboardType: number ? TextInputType.number : TextInputType.text,
        decoration: InputDecoration(labelText: label, helperText: helper),
      );

  /// Back (where there is a step to go back to) and the step's main action.
  Widget _nav(String nextLabel, VoidCallback? onNext) => Padding(
        padding: const EdgeInsets.only(top: 18),
        child: Row(children: [
          if (_prevStep != null) ...[
            OutlinedButton(onPressed: _busy ? null : _goBack, child: Text(tr('رجوع', 'Back'))),
            const SizedBox(width: 8),
          ],
          Expanded(child: FilledButton(onPressed: onNext, child: Text(nextLabel))),
        ]),
      );

  Widget get _lockedNote => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Text(
          tr('البيانات دي اتحفظت مع المسودة ومش بتتغير من هنا.', 'These details are saved with the draft and cannot be changed here.'),
          style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted, height: 1.5),
        ),
      );

  String get _working => tr('جاري…', 'Working…');

  Widget _stepBody() {
    final locked = _unitSaved;
    switch (_step) {
      case 0:
        final types = (_compound?.unitTypes.isNotEmpty ?? false)
            ? _compound!.unitTypes
            // The owner's groups (web enums.ts UNIT_TYPE_GROUPS): apartments, villas, commercial.
            : const ['apartment', 'studio', 'duplex', 'ground_apartment', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'chalet', 'office', 'retail'];
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (locked) _lockedNote,
          _label(tr('الكمبوند', 'Compound')),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _compound?.id,
            hint: Text(tr('اختار الكمبوند', 'Choose the compound')),
            items: [for (final c in _compounds) DropdownMenuItem(value: c.id, child: Text('${c.name}، ${c.areaName}', overflow: TextOverflow.ellipsis))],
            onChanged: locked
                ? null
                : (id) => setState(() {
                      _compound = _compounds.firstWhere((c) => c.id == id);
                      if (_compound!.unitTypes.isNotEmpty && !_compound!.unitTypes.contains(_type)) _type = _compound!.unitTypes.first;
                    }),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(tr('بناخد موقع الكمبوند، فمش محتاج تحدد مكان الوحدة على الخريطة.', "We use the compound's location, so you don't need to drop a pin."),
                style: const TextStyle(fontSize: 12, color: AqarColors.textMuted)),
          ),
          // The list failed to load: without this there was no way to try again short of
          // leaving the wizard.
          if (_compounds.isEmpty && _error != null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(onPressed: () {
                setState(() => _error = null);
                _loadCompounds();
              }, child: Text(tr('حمّل الكمبوندات تاني', 'Reload compounds'))),
            ),
          _label(tr('نوع الوحدة', 'Unit type')),
          _chips([for (final t in types) (t, unitTypeLabel(t))], _type, (v) => setState(() => _type = v), locked: locked),
          _nav(tr('التالي: المساحة والتفاصيل', 'Next: size and details'), _busy ? null : _nextUnitStep),
        ]);

      case 1:
        final sizeHint = _compound?.minSize != null && _compound?.maxSize != null
            ? tr('مساحات ${_compound!.name} من ${_compound!.minSize} لـ ${_compound!.maxSize} م²', 'Units in ${_compound!.name} run ${_compound!.minSize} to ${_compound!.maxSize} sqm')
            : null;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (locked) _lockedNote,
          const SizedBox(height: 8),
          _field(tr('المساحة م²', 'Size (sqm)'), _size, helper: sizeHint, locked: locked),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _field(tr('غرف نوم', 'Bedrooms'), _beds, locked: locked)),
            const SizedBox(width: 10),
            Expanded(child: _field(tr('حمامات', 'Bathrooms'), _baths, locked: locked)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _field(tr('الدور', 'Floor'), _floor, locked: locked)),
            const SizedBox(width: 10),
            Expanded(child: _field(tr('المبنى', 'Building'), _building, number: false, locked: locked)),
            const SizedBox(width: 10),
            Expanded(child: _field(tr('رقم الوحدة', 'Unit no.'), _unitNo, number: false, locked: locked)),
          ]),
          _label(tr('التشطيب', 'Finishing')),
          _chips([for (final f in const ['core_shell', 'semi_finished', 'fully_finished', 'furnished']) (f, finishingLabel(f))], _finishing,
              (v) => setState(() => _finishing = v), locked: locked),
          _label(tr('الاستلام', 'Delivery')),
          _chips([('ready', tr('استلام فوري', 'Ready')), ('under_construction', tr('تحت الإنشاء', 'Under construction'))], _delivery,
              (v) => setState(() => _delivery = v), locked: locked),
          _nav(tr('التالي: السعر', 'Next: price'), _busy ? null : _nextUnitStep),
        ]);

      case 2:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 8),
          // Rent was removed (owner, 2026-10-11): every listing is a sale.
          TextField(
            controller: _price,
            keyboardType: TextInputType.number,
            // "8,000,000" as typed, Arabic-Indic digits too; the plain number is sent.
            inputFormatters: [AmountInputFormatter()],
            decoration: InputDecoration(labelText: tr('السعر (ج.م)', 'Price (EGP)')),
            style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
          ),
          const SizedBox(height: 10),
          InkWell(
            onTap: () => setState(() => _withoutOver = !_withoutOver),
            borderRadius: BorderRadius.circular(6),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Checkbox(
                    value: _withoutOver,
                    activeColor: AqarColors.accent500,
                    onChanged: (v) => setState(() => _withoutOver = v ?? false),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(tr('بدون أوفر', 'Without over'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AqarColors.ink900)),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          tr('هبيع بسعر التعاقد الأصلي، من غير أي زيادة (أوفر).', "I'll sell at the original contract price, with no premium (over) on top."),
                          style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500, height: 1.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          _label(tr('طريقة الدفع', 'Payment')),
          // The server cannot change a draft's payment type, so it locks with the unit.
          _chips([('cash', tr('كاش', 'Cash')), ('installments', tr('تقسيط', 'Installments')), ('resale_installments', tr('ريسيل بأقساط', 'Resale with installments'))],
              _payment, (v) => setState(() => _payment = v), locked: locked),
          _nav(_busy ? _working : tr('التالي: الملكية', 'Next: ownership'), _busy ? null : _nextUnitStep),
        ]);

      case _ownershipStep:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(
            tr('صوّر مستند ملكية الوحدة. بنقراه ونقارنه بالبيانات اللي كتبتها، وده اللي بيخلّي الإعلان موثّق.',
                'Photograph the unit\'s ownership document. We read it and compare it with what you entered. That is what makes the listing verified.'),
            style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink700),
          ),
          if (_docSent) ...[
            const SizedBox(height: 10),
            Text(
              tr('المستند اتبعت. لو عايز تبعت غيره صوّره تاني.', 'Document sent. To replace it, photograph it again.'),
              style: const TextStyle(fontSize: 13.5, color: AqarColors.ok700, fontWeight: FontWeight.w600),
            ),
          ],
          _label(tr('نوع المستند', 'Document type')),
          _chips([
            ('contract', tr('عقد', 'Contract')),
            ('deed', tr('عقد مسجل', 'Registered deed')),
            ('allocation', tr('خطاب تخصيص', 'Allocation letter')),
            ('court_contract', tr('صحة توقيع', 'Court-validated contract')),
          ], _docType, (v) => setState(() => _docType = v)),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: _busy || _docPages.length >= 3 ? null : _addDocPage,
            child: Text(_docPages.isEmpty ? tr('صوّر المستند', 'Photograph the document') : tr('أضف صفحة (${_docPages.length}/3)', 'Add a page (${_docPages.length}/3)')),
          ),
          if (_docPages.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(tr('${_docPages.length} صفحة جاهزة', '${_docPages.length} page(s) ready'), style: const TextStyle(color: AqarColors.ok700, fontWeight: FontWeight.w700)),
          ],
          _nav(
            _busy ? tr('بنقرا المستند…', 'Reading the document…') : tr('التالي: الصور', 'Next: photos'),
            _busy || (_docPages.isEmpty && !_docSent) ? null : _nextFromDoc,
          ),
        ]);

      case _photosStep:
        final missing = requiredRooms.where((r) => !_rooms.contains(r)).toList();
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(
            tr('صوّر الوحدة من التطبيق وإنت جوه الكمبوند: ٦ صور على الأقل، صورة لكل مكان. الصور اللي تتصور برّه الكمبوند مش بتتحسب.',
                'Photograph the unit in the app while you are inside the compound: at least 6, one per space. Photos taken outside the compound do not count.'),
            style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink700),
          ),
          const SizedBox(height: 12),
          // Done rooms in green with a tick, the rest in grey: a checklist, not chips.
          Wrap(spacing: 14, runSpacing: 6, children: [
            for (final r in requiredRooms)
              Text(
                _rooms.contains(r) ? '✓ ${roomLabel(r)}' : roomLabel(r),
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: _rooms.contains(r) ? FontWeight.w600 : FontWeight.w400,
                  color: _rooms.contains(r) ? AqarColors.ok700 : AqarColors.ink500,
                ),
              ),
          ]),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: _busy ? null : _takePhotos,
            child: Text(missing.isEmpty ? tr('صوّر تاني', 'Take more') : tr('افتح الكاميرا (باقي ${missing.length})', 'Open the camera (${missing.length} left)')),
          ),
          _nav(tr('التالي: المراجعة', 'Next: review'), _busy ? null : _review),
        ]);

      default:
        final v = _validation;
        final blocks = ((v?['blocks'] as List?) ?? const []).cast<Map<String, dynamic>>();
        final warnings = ((v?['warnings'] as List?) ?? const []).cast<Map<String, dynamic>>();
        final canPublish = v?['canPublish'] == true;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_busy && v == null) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          if (v != null) ...[
            Text(
              canPublish
                  ? tr('كل الفحوصات عدّت', 'All checks passed')
                  : tr('فاضل ${blocks.length} ${blocks.length == 1 ? 'حاجة' : 'حاجات'} قبل النشر', blocks.length == 1 ? '1 thing to fix' : '${blocks.length} things to fix'),
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: canPublish ? AqarColors.ok700 : AqarColors.danger),
            ),
            const SizedBox(height: 10),
            for (final b in blocks) _issue(b, true),
            for (final w in warnings) _issue(w, false),
            const SizedBox(height: 10),
            if (!canPublish)
              Wrap(spacing: 8, children: [
                OutlinedButton(onPressed: () => setState(() => _step = _ownershipStep), child: Text(tr('المستند', 'Document'))),
                OutlinedButton(onPressed: () => setState(() => _step = _photosStep), child: Text(tr('الصور', 'Photos'))),
                OutlinedButton(onPressed: _busy ? null : _review, child: Text(tr('افحص تاني', 'Check again'))),
              ]),
            _nav(_busy ? _working : tr('ابعت للمراجعة', 'Submit for review'), _busy || !canPublish ? null : _submit),
            const SizedBox(height: 8),
            Text(tr('نشر الإعلان مجاني، والرسم بيتدفع بس لما الوحدة تتباع.', 'Listing is free; the fee is due only when the unit sells.'),
                style: const TextStyle(fontSize: 12, color: AqarColors.textMuted)),
          ],
        ]);
    }
  }

  /// One check result as a line of text: blocks in red, warnings in grey.
  Widget _issue(Map<String, dynamic> i, bool block) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('•  ', style: TextStyle(color: block ? AqarColors.danger : AqarColors.ink500, height: 1.5)),
          Expanded(
            child: Text(
              (isEn ? i['messageEn'] : i['messageAr']) as String? ?? '',
              style: TextStyle(fontSize: 14, color: block ? AqarColors.danger : AqarColors.ink700, height: 1.5),
            ),
          ),
        ]),
      );
}
