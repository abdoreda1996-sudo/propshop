import 'package:flutter/material.dart';

import '../models/deal.dart';
import '../models/offer.dart';
import '../screens/login_screen.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import 'filter_controls.dart' show parseAmount, AmountInputFormatter;

/// A non-scrolling state (empty, error) made pullable inside a RefreshIndicator. The
/// child gets the viewport's full height, so it must not itself be a scroll view that
/// needs bounded constraints from a ListView (EmptyState is fine: it is sized here).
Widget pullable(Widget child) => LayoutBuilder(
      builder: (context, box) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [SizedBox(height: box.maxHeight, child: child)],
      ),
    );

/// Shown by Offers and Deals to a signed-out user: what the tab is for, and the way in.
/// Not an error: being signed out is an ordinary state.
class SignInPrompt extends StatelessWidget {
  const SignInPrompt({super.key, required this.title, required this.body});
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return ListView(
      // Scrollable so the RefreshIndicator around it still works.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 40, 24, 24),
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 18, height: 1.3, fontWeight: FontWeight.w700, color: AqarColors.ink900),
        ),
        const SizedBox(height: 6),
        Text(body, style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink500)),
        const SizedBox(height: 18),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: FilledButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const LoginScreen()),
            ),
            child: Text(tr('تسجيل الدخول', 'Sign in')),
          ),
        ),
      ],
    );
  }
}

/// Status as coloured text: green when it went through, red when it did not, grey
/// otherwise. No box around it.
class StatusText extends StatelessWidget {
  const StatusText({super.key, required this.status, this.label});
  final String status;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final ok = status == 'accepted';
    final bad = status == 'rejected';
    return Text(
      label ?? offerStatusLabel(status),
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: ok ? AqarColors.ok700 : (bad ? AqarColors.danger : AqarColors.ink500),
      ),
    );
  }
}

Future<bool> _confirm(BuildContext context, String title, String body, String yes) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
      content: Text(body, style: const TextStyle(fontSize: 14, height: 1.6)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          style: TextButton.styleFrom(foregroundColor: AqarColors.ink500),
          child: Text(tr('رجوع', 'Back')),
        ),
        TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(yes)),
      ],
    ),
  );
  return r == true;
}

/// One negotiation, with its history folded inside: the app's twin of
/// OfferChainCard.tsx. It answers "whose move is it" before anything else.
///
/// Drawn flat: the screen separates negotiations with hairlines, not cards.
class OfferChainTile extends StatefulWidget {
  const OfferChainTile({super.key, required this.chain, required this.onAct});

  final OfferChain chain;

  /// (action, amount): the parent owns the API call and the refresh.
  final Future<String?> Function(String action, {double? amount}) onAct;

  @override
  State<OfferChainTile> createState() => _OfferChainTileState();
}

class _OfferChainTileState extends State<OfferChainTile> {
  bool _busy = false;
  bool _countering = false;
  bool _showHistory = false;
  String? _error;
  final _counter = TextEditingController();

  @override
  void dispose() {
    _counter.dispose();
    super.dispose();
  }

  Future<void> _act(String action, {double? amount}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await widget.onAct(action, amount: amount);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
      if (err == null) _countering = false;
    });
  }

  Future<void> _accept() async {
    final c = widget.chain;
    final ok = await _confirm(
      context,
      tr('تقبل العرض؟', 'Accept this offer?'),
      tr(
        'هتقبل ${formatPriceExact(c.latestAmount, currency: c.currency)} للوحدة ${c.reference}. بعدها بتتفتح صفقة والوحدة بتتحجز.',
        'You accept ${formatPriceExact(c.latestAmount, currency: c.currency)} for ${c.reference}. A deal opens and the unit is reserved.',
      ),
      tr('اقبل', 'Accept'),
    );
    if (ok && mounted) _act('accept');
  }

  Future<void> _reject() async {
    final ok = await _confirm(
      context,
      tr('ترفض العرض؟', 'Reject this offer?'),
      tr('التفاوض ده هيتقفل، والطرف التاني يقدر يبعت عرض جديد.', 'This negotiation closes. The other side can send a new offer.'),
      tr('ارفض', 'Reject'),
    );
    if (ok && mounted) _act('reject');
  }

  void _sendCounter() {
    final v = parseAmount(_counter.text);
    if (v == null) {
      setState(() => _error = tr('اكتب السعر بالأرقام.', 'Enter the price in numbers.'));
      return;
    }
    _act('counter', amount: v.toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.chain;
    final live = c.liveStep;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  c.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, height: 1.35, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                ),
              ),
              const SizedBox(width: 12),
              StatusText(status: c.status),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            '${c.counterparty.label} · ${tr('المطلوب', 'Asking')} ${formatPriceExact(c.askingPrice, currency: c.currency)}',
            style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
          ),
          const SizedBox(height: 10),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.end,
            spacing: 8,
            children: [
              Text(
                formatPriceExact(c.latestAmount, currency: c.currency),
                style: AqarType.figure(size: 20),
              ),
              if (c.steps.length > 1)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    tr('بعد ${formatNumber(c.steps.length)} عروض', 'after ${formatNumber(c.steps.length)} offers'),
                    style: const TextStyle(fontSize: 12, color: AqarColors.ink500),
                  ),
                ),
            ],
          ),

          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.danger),
            ),
          ],

          // Actions only when it is genuinely this user's move.
          if (live != null && c.myMove && !_countering) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _accept,
                    child: Text(_busy ? '…' : tr('اقبل', 'Accept')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy ? null : () => setState(() => _countering = true),
                    child: Text(tr('اقترح سعر تاني', 'Counter')),
                  ),
                ),
              ],
            ),
            TextButton(
              onPressed: _busy ? null : _reject,
              style: TextButton.styleFrom(foregroundColor: AqarColors.ink500, padding: EdgeInsets.zero),
              child: Text(tr('ارفض العرض', 'Reject offer')),
            ),
          ],

          if (live != null && !c.myMove) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    tr('مستنيين رد الطرف التاني.', 'Waiting for the other side to reply.'),
                    style: const TextStyle(fontSize: 13, color: AqarColors.ink500),
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : () => _act('withdraw'),
                  child: Text(tr('اسحب العرض', 'Withdraw offer')),
                ),
              ],
            ),
          ],

          if (_countering) ...[
            const SizedBox(height: 12),
            Directionality(
              textDirection: TextDirection.ltr,
              child: TextField(
                controller: _counter,
                keyboardType: TextInputType.number,
                inputFormatters: [AmountInputFormatter()],
                autofocus: true,
                onSubmitted: (_) => _sendCounter(),
                style: const TextStyle(fontFeatures: AqarType.tnum),
                decoration: InputDecoration(
                  labelText: tr('السعر اللي تقبله', 'Price you would accept'),
                  suffixText: tr('ج.م', 'EGP'),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _sendCounter,
                    child: Text(tr('ابعت', 'Send')),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy ? null : () => setState(() => _countering = false),
                  child: Text(tr('إلغاء', 'Cancel')),
                ),
              ],
            ),
          ],

          if (c.steps.length > 1) ...[
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => setState(() => _showHistory = !_showHistory),
              style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 36)),
              child: Text(
                _showHistory ? tr('إخفاء العروض السابقة', 'Hide earlier offers') : tr('العروض السابقة', 'Earlier offers'),
              ),
            ),
            if (_showHistory)
              for (final s in c.steps)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${s.direction == OfferSide.buyer ? tr('المشتري', 'Buyer') : tr('المالك', 'Owner')} · ${formatDate(s.createdAt)}',
                          style: const TextStyle(fontSize: 12, color: AqarColors.ink500),
                        ),
                      ),
                      Text(
                        formatPriceExact(s.amount, currency: c.currency),
                        style: AqarType.figure(size: 13, weight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

/// A viewing request, from either side.
class ViewingTile extends StatefulWidget {
  const ViewingTile({super.key, required this.viewing, required this.onAct});

  final Viewing viewing;
  final Future<String?> Function(String action, {DateTime? at}) onAct;

  @override
  State<ViewingTile> createState() => _ViewingTileState();
}

class _ViewingTileState extends State<ViewingTile> {
  bool _busy = false;
  String? _error;

  Future<void> _act(String action, {DateTime? at}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await widget.onAct(action, at: at);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.viewing;
    final isSeller = v.role == OfferSide.seller;
    final confirmed = v.status == 'accepted';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    v.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, height: 1.35, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                  ),
                ),
                const SizedBox(width: 12),
                // The real status: a declined or cancelled viewing used to read "pending".
                StatusText(
                  status: switch (v.status) {
                    'accepted' || 'completed' => 'accepted',
                    'declined' || 'cancelled' => 'rejected',
                    _ => 'pending',
                  },
                  label: viewingStatusLabel(v.status),
                ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              isSeller ? tr('مشتري طلب يعاين وحدتك', 'A buyer asked to view your unit') : tr('طلبت تعاين الوحدة دي', 'You asked to view this unit'),
              style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500),
            ),

            if (confirmed && v.scheduledAt != null) ...[
              const SizedBox(height: 12),
              Text(
                v.scheduledLabel!,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AqarColors.ok700, fontFeatures: AqarType.tnum),
              ),
              const SizedBox(height: 4),
              Text(
                tr(
                  'المعاينة اتأكدت، فتقدروا دلوقتي تتبادلوا الأرقام من الرسايل.',
                  'The viewing is confirmed, so you can now swap numbers in Messages.',
                ),
                style: const TextStyle(fontSize: 12.5, height: 1.5, color: AqarColors.ink700),
              ),
            ],

            // Owner picks one of the buyer's slots.
            if (isSeller && v.status == 'requested') ...[
              const SizedBox(height: 12),
              Text(
                v.slots.isEmpty
                    ? tr('المشتري ماقترحش مواعيد.', 'The buyer did not suggest any times.')
                    : tr('اختار ميعاد من اللي المشتري اقترحها:', 'Pick one of the times the buyer suggested:'),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.ink900),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < v.slots.length; i++)
                    OutlinedButton(
                      onPressed: _busy ? null : () => _act('accept', at: v.slots[i]),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                      child: Text(v.slotLabel(i), style: const TextStyle(fontSize: 13, fontFeatures: AqarType.tnum)),
                    ),
                ],
              ),
              TextButton(
                onPressed: _busy ? null : () => _act('decline'),
                style: TextButton.styleFrom(foregroundColor: AqarColors.ink500, padding: EdgeInsets.zero),
                child: Text(tr('ولا ميعاد فيهم يناسبني', 'None of these times work')),
              ),
            ],

            // Buyer confirms the owner's suggestion.
            if (!isSeller && v.status == 'proposed' && v.proposedAt != null) ...[
              const SizedBox(height: 12),
              Text(
                '${tr('المالك اقترح', 'The owner suggested')} ${v.proposedLabel}',
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, fontFeatures: AqarType.tnum),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : () => _act('confirm'),
                      child: Text(tr('يناسبني', 'Works for me')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: _busy ? null : () => _act('cancel'),
                    child: Text(tr('إلغاء', 'Cancel')),
                  ),
                ],
              ),
            ],

            if (!isSeller && v.status == 'requested') ...[
              const SizedBox(height: 10),
              Text(
                tr('مستنيين المالك يختار ميعاد.', 'Waiting for the owner to pick a time.'),
                style: const TextStyle(fontSize: 13, color: AqarColors.ink500),
              ),
            ],

            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.danger),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
