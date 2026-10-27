import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/listing.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'login_screen.dart';
import 'open_request_screen.dart';

/// The buyer's requests with a live 24-hour countdown — the promise made visible
/// (Section 6c).
class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> {
  List<BuyerRequest> _requests = [];
  bool _loading = true;
  String? _error;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _load();
    // The countdown has to move without a reload, so re-render once a minute.
    _ticker = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (!context.read<SessionController>().isSignedIn) {
      setState(() {
        _loading = false;
        _requests = [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final json = await context.read<Api>().myRequests();
      final list = (json['requests'] as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() => _requests = list.map(BuyerRequest.fromJson).toList());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.code == 'network_error'
            ? tr(
                'تأكد إنك متصل بالإنترنت.',
                'Check that you are connected to the internet.',
              )
            : tr(
                'حصل خطأ غير متوقع (${e.code}).',
                'Something unexpected went wrong (${e.code}).',
              ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('طلباتي', 'My requests')),
        actions: const [LangToggleButton()],
      ),
      body: !session.isSignedIn
          ? EmptyState(
              title: tr('سجّل دخولك', 'Sign in'),
              body: tr(
                'عشان نقدر نتابع طلباتك ونوريك حالتها ووقت الرد المتبقي.',
                'So we can track your requests and show you their status and the reply time left.',
              ),
              action: FilledButton(
                onPressed: () async {
                  final ok = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                  );
                  if (ok == true) _load();
                },
                child: Text(tr('تسجيل الدخول', 'Sign in')),
              ),
            )
          : _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? ErrorNotice(message: _error!, onRetry: _load)
          : _requests.isEmpty
          ? EmptyState(
              title: tr(
                'لسه مابعتش أي طلب',
                'You have not sent any requests yet',
              ),
              body: tr(
                'اختار وحدة واطلبها، أو ابعتلنا طلبك وهنجمعلك الوحدات الموثقة المطابقة.',
                'Pick a unit and request it, or send your request and we gather the matching verified units for you.',
              ),
              action: FilledButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const OpenRequestScreen()),
                ),
                child: Text(tr('ابعت طلبك', 'Send your request')),
              ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                itemCount: _requests.length,
                separatorBuilder: (_, __) => const Divider(),
                itemBuilder: (_, i) => _RequestTile(request: _requests[i]),
              ),
            ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request});
  final BuyerRequest request;

  @override
  Widget build(BuildContext context) {
    // A row in a list, not a card: the hairline between rows does the separating.
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  request.reference,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AqarColors.ink500,
                    fontFeatures: AqarType.tnum,
                  ),
                ),
                Text(
                  '  ·  ${request.type == 'unit' ? tr('طلب وحدة', 'Unit request') : tr('طلب مفتوح', 'Open request')}',
                  style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              request.listingTitle?.isNotEmpty == true
                  ? request.listingTitle!
                  : tr('طلب مفتوح', 'Open request'),
              style: const TextStyle(
                fontSize: 15,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: AqarColors.ink900,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Flexible(child: AqarBadge.owner(requestStatusLabel(request.status))),
                const SizedBox(width: 8),
                const Spacer(),
                if (request.firstResponseAt != null)
                  AqarBadge.verified(
                    tr(
                      'تم الرد ${formatDate(request.firstResponseAt!)}',
                      'Replied ${formatDate(request.firstResponseAt!)}',
                    ),
                  )
                else if (request.status != 'closed' &&
                    request.status != 'cancelled')
                  request.breached
                      ? AqarBadge.danger(formatCountdown(request.remaining))
                      : request.urgent
                      ? AqarBadge.neutral(formatCountdown(request.remaining))
                      : AqarBadge.verified(formatCountdown(request.remaining)),
              ],
            ),
            if (request.advisorName != null) ...[
              const SizedBox(height: 8),
              Text(
                tr(
                  'المستشار: ${request.advisorName}',
                  'Advisor: ${request.advisorName}',
                ),
                style: const TextStyle(
                  fontSize: 12,
                  color: AqarColors.textMuted,
                ),
              ),
            ],
            if (request.breached) ...[
              const SizedBox(height: 12),
              Text(
                tr(
                  'آسفين، عدّينا الـ24 ساعة اللي وعدناك بيها. طلبك اتحوّل لمدير الفريق وهيكلمك في أقرب وقت.',
                  'Sorry, we went past the 24 hours we promised. A team manager now has your request and will be in touch soon.',
                ),
                style: const TextStyle(
                  fontSize: 12.5,
                  height: 1.55,
                  color: AqarColors.danger,
                ),
              ),
            ],
          ],
        ),
    );
  }
}
