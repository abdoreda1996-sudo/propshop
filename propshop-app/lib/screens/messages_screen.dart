import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/deal.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'thread_screen.dart';

/// Every masked thread this user is in — the app's twin of /dashboard/messages.
///
/// Neither side sees the other's name or number here; the list shows the pseudonymous
/// handle and, once a viewing is confirmed, says so.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  List<Thread> _threads = [];
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
      final json = await context.read<Api>().conversations();
      if (!mounted) return;
      setState(
        () => _threads = ((json['conversations'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(Thread.fromJson)
            .toList(),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.code == 'unauthorized'
            ? tr(
                'سجّل دخولك عشان تشوف رسايلك.',
                'Sign in to see your messages.',
              )
            : tr(
                'مش قادرين نحمّل الرسايل دلوقتي.',
                "We couldn't load your messages right now.",
              ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('الرسايل', 'Messages')),
        actions: const [LangToggleButton()],
      ),
      body: RefreshIndicator(onRefresh: _load, child: _body()),
    );
  }

  Widget _body() {
    if (_error != null) return ErrorNotice(message: _error!, onRetry: _load);
    if (_loading && _threads.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_threads.isEmpty) {
      return EmptyState(
        title: tr('مافيش رسايل', 'No messages'),
        body: tr(
          'محادثاتك السابقة مع الملاك بتظهر هنا. للوحدات الجديدة: قدّم عرض أو اطلب معاينة من صفحة الوحدة.',
          'Your earlier conversations with owners appear here. For a new unit, make an offer or request a viewing from its page.',
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _threads.length,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, indent: 16, endIndent: 16),
      itemBuilder: (_, i) {
        final t = _threads[i];
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 6,
          ),
          // Unread count, as on the website's inbox.
          trailing: t.unread > 0
              ? Badge(label: Text('${t.unread}'), backgroundColor: AqarColors.accent500)
              : null,
          title: Text(
            t.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w600,
              color: AqarColors.ink900,
            ),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 2),
              Row(
                children: [
                  Flexible(
                    child: Text(
                      t.counterparty.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AqarColors.textMuted,
                      ),
                    ),
                  ),
                  // Said in words; a lone padlock icon meant nothing to most people.
                  if (t.contactUnlocked)
                    Text(
                      tr('  ·  المعاينة متأكدة', '  ·  viewing confirmed'),
                      style: const TextStyle(fontSize: 12, color: AqarColors.ok700),
                    ),
                ],
              ),
              if (t.preview != null) ...[
                const SizedBox(height: 4),
                Text(
                  t.preview!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AqarColors.ink700,
                  ),
                ),
              ],
            ],
          ),
          onTap: () async {
            await Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => ThreadScreen(thread: t)));
            if (mounted) _load();
          },
        );
      },
    );
  }
}
