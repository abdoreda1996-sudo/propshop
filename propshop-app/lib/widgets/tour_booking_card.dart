import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/viewing_slots.dart';
import '../theme/tokens.dart';

/// The owner books PropShop's professional photography + 360° tour shoot for a listing:
/// the app's twin of the web TourBookingCard. Staff arrange it (admin "Tour bookings");
/// the finished tour lands on the listing by itself.
class TourBookingCard extends StatefulWidget {
  const TourBookingCard({super.key, required this.listingId});
  final String listingId;

  @override
  State<TourBookingCard> createState() => _TourBookingCardState();
}

class _TourBookingCardState extends State<TourBookingCard> {
  Map<String, dynamic>? _view;
  bool _busy = false;
  DateTime? _day;
  String _window = viewingWindows.first.key;
  final _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final v = await context.read<Api>().tourBooking(widget.listingId);
      if (mounted) setState(() => _view = v);
    } on ApiException {
      if (mounted) setState(() => _view = const {});
    }
  }

  void _say(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  String _error(String code) => switch (code) {
        'slot_invalid' => tr('اختار يوم وفترة.', 'Pick a day and a window.'),
        'slot_in_past' => tr('الميعاد لازم يكون في المستقبل.', 'The time must be in the future.'),
        'already_booked' => tr('فيه حجز مفتوح للإعلان ده بالفعل.', 'There is already an open booking for this listing.'),
        'listing_closed' => tr('الإعلان ده مقفول.', 'This listing is closed.'),
        _ => tr('حصل خطأ ($code).', 'Something went wrong ($code).'),
      };

  Future<void> _book() async {
    if (_day == null) return;
    setState(() => _busy = true);
    try {
      await context.read<Api>().bookTourShoot(widget.listingId, date: ymd(_day!), window: _window, note: _note.text.trim());
      if (!mounted) return;
      _note.clear();
      _say(tr('الحجز وصل. فريقنا هيكلمك يأكد الميعاد.', 'Booked. Our team will call you to confirm the time.'));
      await _load();
    } on ApiException catch (e) {
      if (mounted) _say(_error(e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('تلغي الحجز؟', 'Cancel the booking?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('رجوع', 'Back'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('الغي', 'Cancel it'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<Api>().cancelTourShoot(widget.listingId);
      await _load();
    } on ApiException catch (e) {
      if (mounted) _say(_error(e.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _statusText(String s) => switch (s) {
        'requested' => tr('طلبك وصل، وفريقنا هيكلمك يحدد الميعاد', 'Request received. Our team will call you to set the time'),
        'scheduled' => tr('اتحدد ميعاد التصوير', 'Shoot scheduled'),
        'shot' => tr('التصوير خلص، والجولة بتتجهز', 'Shot. Your tour is being edited'),
        'delivered' => tr('الجولة جاهزة وظاهرة على إعلانك', 'Delivered. The tour is live on your listing'),
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    final v = _view;
    if (v == null) return const SizedBox(height: 60, child: Center(child: CircularProgressIndicator()));
    if (v.isEmpty) return const SizedBox.shrink();
    final booking = v['booking'] as Map<String, dynamic>?;
    final last = v['last'] as Map<String, dynamic>?;
    final fee = (v['fee'] as num?)?.toDouble();
    final bookable = v['bookable'] == true;

    // A section under a hairline, not a card: it sits inside screens that have their own.
    return Container(
      padding: const EdgeInsets.only(top: 16),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: AqarColors.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(tr('تصوير احترافي وجولة 360°', 'Professional photos and a 360° tour'),
              style: const TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
          const SizedBox(height: 6),
          Text(
            tr('مصوّر من عندنا ييجي الوحدة، يصوّر صور وجولة 360°، ونحطهم على إعلانك بنفسنا.',
                'One of our photographers visits the unit, shoots photos and a 360° tour, and we add them to your listing.'),
            style: const TextStyle(fontSize: 13, height: 1.6, color: AqarColors.ink500),
          ),
          if (fee != null && booking == null) ...[
            const SizedBox(height: 6),
            Text(formatPriceExact(fee, currency: 'EGP'), style: AqarType.figure(size: 15, weight: FontWeight.w600)),
          ],
          const SizedBox(height: 12),
          if (booking != null) ..._current(booking) else if (bookable) ..._form(last) else
            Text(tr('الإعلان ده مقفول.', 'This listing is closed.'), style: const TextStyle(color: AqarColors.textMuted)),
      ]),
    );
  }

  List<Widget> _current(Map<String, dynamic> b) {
    final status = b['status'] as String? ?? 'requested';
    final scheduled = SlotView.fromJson(b['scheduledSlot']);
    final preferred = SlotView.fromJson(b['preferredSlot']);
    final photographer = (b['photographer'] as Map?)?['fullName'] as String?;
    return [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AqarColors.ink50, borderRadius: BorderRadius.circular(AqarRadius.control)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${_statusText(status)}${b['reference'] != null ? ' · ${b['reference']}' : ''}',
              style: const TextStyle(fontWeight: FontWeight.w700, color: AqarColors.ink900)),
          const SizedBox(height: 6),
          if (scheduled != null)
            Text(scheduled.label, style: const TextStyle(fontWeight: FontWeight.w600, color: AqarColors.ok700))
          else if (preferred != null)
            Text('${tr('الميعاد اللي طلبته: ', 'Your preferred time: ')}${preferred.label}', style: const TextStyle(color: AqarColors.ink700)),
          if (photographer != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('${tr('المصوّر: ', 'Photographer: ')}$photographer', style: const TextStyle(fontSize: 13, color: AqarColors.textMuted)),
            ),
        ]),
      ),
      if (status == 'requested' || status == 'scheduled')
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: _busy ? null : _cancel,
            style: TextButton.styleFrom(foregroundColor: AqarColors.danger),
            child: Text(tr('إلغاء الحجز', 'Cancel booking')),
          ),
        ),
    ];
  }

  List<Widget> _form(Map<String, dynamic>? last) {
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    return [
      if (last?['status'] == 'delivered')
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(_statusText('delivered'), style: const TextStyle(color: AqarColors.ok700)),
        ),
      OutlinedButton.icon(
        onPressed: _busy
            ? null
            : () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _day ?? tomorrow,
                  firstDate: tomorrow,
                  lastDate: tomorrow.add(const Duration(days: 60)),
                );
                if (d != null) setState(() => _day = d);
              },
        icon: const Icon(Icons.calendar_today_outlined, size: 18),
        label: Text(_day == null ? tr('اختار اليوم اللي يناسبك', 'Pick a day that suits you') : dayLabel(_day!)),
      ),
      const SizedBox(height: 8),
      Wrap(spacing: 8, children: [
        for (final w in viewingWindows)
          ChoiceChip(label: Text(w.label), selected: _window == w.key, onSelected: (_) => setState(() => _window = w.key)),
      ]),
      const SizedBox(height: 8),
      TextField(
        controller: _note,
        maxLength: 500,
        decoration: InputDecoration(labelText: tr('ملاحظة للمصوّر (اختياري)', 'Note for the photographer (optional)'), counterText: ''),
      ),
      const SizedBox(height: 10),
      FilledButton(onPressed: _busy || _day == null ? null : _book, child: Text(tr('احجز التصوير', 'Book the shoot'))),
      const SizedBox(height: 6),
      Text(tr('ده الميعاد اللي يناسبك. فريقنا هيكلمك يأكده.', 'This is the time that suits you. Our team will call you to confirm it.'),
          style: const TextStyle(fontSize: 12, color: AqarColors.textMuted)),
    ];
  }
}
