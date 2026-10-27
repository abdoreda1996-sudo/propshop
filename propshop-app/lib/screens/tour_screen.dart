import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/tour.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/tour_widgets.dart';
import '../widgets/tour_booking_card.dart';

/// The owner adds virtual tours to one listing: the app's twin of
/// /dashboard/listings/[id]/tour. Each tour waits for the team's review before it appears,
/// so this works on a live listing without unpublishing it.
class TourScreen extends StatefulWidget {
  const TourScreen({super.key, required this.listingId, required this.reference});
  final String listingId;
  final String reference;

  @override
  State<TourScreen> createState() => _TourScreenState();
}

class _TourScreenState extends State<TourScreen> {
  final _link = TextEditingController();
  final _title = TextEditingController();
  List<Tour>? _tours;
  String? _loadError;
  bool _busy = false;
  String? _uploadingName;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _link.dispose();
    _title.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final j = await context.read<Api>().listingTours(widget.listingId);
      if (!mounted) return;
      setState(() {
        _tours = ((j['tours'] as List?) ?? const []).cast<Map<String, dynamic>>().map(Tour.fromJson).toList();
        _loadError = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.code);
    }
  }

  int get _slotsLeft => maxToursPerListing - (_tours ?? const []).where((t) => t.status != 'rejected').length;

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _addLink() async {
    final url = _link.text.trim();
    if (url.isEmpty) return;
    setState(() => _busy = true);
    try {
      await context.read<Api>().addTourLink(widget.listingId, url: url, title: _title.text.trim());
      if (!mounted) return;
      _link.clear();
      _title.clear();
      _say(tr('اتضافت، وهتظهر بعد ما فريقنا يراجعها.', 'Added. It will appear once our team has reviewed it.'));
      await _load();
    } on ApiException catch (e) {
      if (mounted) _say(tourErrorMessage(e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickVideo() async {
    final FilePickerResult? picked;
    try {
      picked = await FilePicker.platform.pickFiles(type: FileType.video, withData: true);
    } catch (_) {
      // The picker can throw (no permission, cancelled mid-read on web); nothing to do.
      return;
    }
    if (!mounted) return;
    final file = picked?.files.single;
    if (file == null) return;
    if (file.size > 200 * 1024 * 1024) return _say(tourErrorMessage('too_large'));
    final bytes = file.bytes;
    if (bytes == null) return _say(tourErrorMessage('not_a_video'));
    if (!mounted) return;
    setState(() {
      _busy = true;
      _uploadingName = file.name;
    });
    try {
      await context.read<Api>().uploadTourVideo(widget.listingId, bytes: bytes, filename: file.name, title: _title.text.trim());
      if (!mounted) return;
      _title.clear();
      _say(tr('الفيديو اترفع، وهيظهر بعد ما فريقنا يراجعه.', 'Video uploaded. It will appear once our team has reviewed it.'));
      await _load();
    } on ApiException catch (e) {
      if (mounted) _say(tourErrorMessage(e.code));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _uploadingName = null;
        });
      }
    }
  }

  Future<void> _delete(Tour t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('تشيل الجولة دي؟', 'Remove this tour?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('رجوع', 'Back'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('شيل', 'Remove'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<Api>().deleteTour(widget.listingId, t.id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) _say(tourErrorMessage(e.code));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('الجولة الافتراضية', 'Virtual tour')), actions: const [LangToggleButton()]),
      body: _loadError != null && _tours == null
          ? ErrorNotice(message: tourErrorMessage(_loadError!), onRetry: _load)
          : _tours == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(widget.reference, style: const TextStyle(color: AqarColors.ink500, fontWeight: FontWeight.w600, fontFeatures: AqarType.tnum)),
                      const SizedBox(height: 6),
                      Text(
                        tr('المشتري بيشوف الوحدة كلها في الفيديو قبل ما يطلب معاينة، فبيوصلك ناس جادة أكتر.',
                            'Buyers see the whole unit in the video before they ask for a viewing, so the people who come are more serious.'),
                        style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink900),
                      ),
                      const SizedBox(height: 16),
                      TourBookingCard(listingId: widget.listingId),
                      const SizedBox(height: 20),
                      SectionTitle(tr('أو أضف جولتك بنفسك', 'Or add your own tour')),
                      for (final t in _tours!) ...[
                        _ManagedTourTile(tour: t, onDelete: _busy ? null : () => _delete(t)),
                        const SizedBox(height: 10),
                      ],
                      if (_slotsLeft > 0) _addForm() else
                        Text(tr('وصلت للحد ($maxToursPerListing جولات).', "You've reached the limit ($maxToursPerListing tours)."),
                            style: const TextStyle(color: AqarColors.textMuted)),
                    ],
                  ),
                ),
    );
  }

  Widget _addForm() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(
              tr('بنراجع كل جولة قبل ما تظهر. لازم تكون للوحدة دي، ومن غير أرقام تليفون أو لوجو سمسار.',
                  'We review every tour before it goes up. It must show this unit, with no phone numbers or broker logos.'),
              style: const TextStyle(fontSize: 12.5, height: 1.6, color: AqarColors.textMuted),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              maxLength: 80,
              decoration: InputDecoration(labelText: tr('عنوان (اختياري)', 'Title (optional)'), counterText: ''),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _link,
              keyboardType: TextInputType.url,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                labelText: tr('لينك جولة أو فيديو', 'Tour or video link'),
                hintText: 'https://youtu.be/…',
                helperText: tr('يوتيوب · فيميو · ماتربورت (3D) · كوولا (360°)', 'YouTube · Vimeo · Matterport (3D) · Kuula (360°)'),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: _busy ? null : _addLink,
              child: Text(tr('أضف اللينك', 'Add link')),
            ),
            const Divider(height: 28),
            OutlinedButton.icon(
              onPressed: _busy ? null : _pickVideo,
              icon: _uploadingName != null
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.video_library_outlined, size: 18),
              label: Text(_uploadingName != null
                  ? tr('جاري رفع $_uploadingName…', 'Uploading $_uploadingName…')
                  : tr('ارفع فيديو من الموبايل (لحد 200 ميجا)', 'Upload a video from your phone (up to 200 MB)')),
            ),
          ]);
}

class _ManagedTourTile extends StatelessWidget {
  const _ManagedTourTile({required this.tour, this.onDelete});
  final Tour tour;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final tone = switch (tour.status) {
      'approved' => (AqarColors.ok50, AqarColors.ok700),
      'rejected' => (AqarColors.dangerBg, AqarColors.danger),
      _ => (AqarColors.ink50, AqarColors.ink700),
    };
    return Container(
      padding: const EdgeInsets.only(bottom: 4),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (tour.status != 'rejected') TourCard(tour: tour),
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(0, 4, 0, 0),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: tone.$1, borderRadius: BorderRadius.circular(3)),
              child: Text(tour.statusLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: tone.$2)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: tour.status == 'rejected'
                  ? Text('${tour.caption}${tour.rejectReason != null ? ': ${tour.rejectReason}' : ''}',
                      style: const TextStyle(fontSize: 12.5, color: AqarColors.danger))
                  : const SizedBox.shrink(),
            ),
            IconButton(onPressed: onDelete, tooltip: tr('شيل', 'Remove'), icon: const Icon(Icons.delete_outline)),
          ]),
        ),
      ]),
    );
  }
}
