import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/deal.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';

/// One masked thread — the app's twin of /dashboard/messages/[id].
///
/// Deliberately plain: bubbles, a box, a button. The only unusual element is the
/// redaction notice — when the platform alters what someone wrote, it tells them.
/// Silently editing a message is a dark pattern.
class ThreadScreen extends StatefulWidget {
  const ThreadScreen({super.key, required this.thread});
  final Thread thread;

  @override
  State<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<ThreadScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  List<ChatMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final json = await context.read<Api>().messages(widget.thread.id);
      if (!mounted) return;
      setState(() {
        _messages = ((json['messages'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ChatMessage.fromJson)
            .toList();
        _error = null;
      });
      _jumpToEnd();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.status == 403
            ? tr('الكلام ده مش بتاعك.', "This conversation isn't yours.")
            : tr(
                'مش قادرين نحمّل الرسايل دلوقتي.',
                "We couldn't load the messages right now.",
              ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _jumpToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _sending = true;
      _notice = null;
    });
    try {
      final res = await context.read<Api>().sendMessage(widget.thread.id, text);
      if (!mounted) return;
      setState(() {
        _messages = [
          ..._messages,
          ChatMessage(
            id: (res['id'] ?? '') as String,
            mine: true,
            body: text,
            flagged: res['wasRedacted'] == true,
          ),
        ];
        _input.clear();
        // Telling the sender is the honest thing. The server returns the notice text.
        if (res['wasRedacted'] == true) {
          _notice =
              (isEn ? null : res['notice'] as String?) ??
              tr(
                'شلنا بيانات التواصل من رسالتك قبل ما توصل.',
                'We removed contact details from your message before it was delivered.',
              );
        }
      });
      _jumpToEnd();
    } on ApiException {
      if (!mounted) return;
      setState(
        () => _notice = tr(
          'مش قادرين نبعت الرسالة.',
          "We couldn't send the message.",
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.thread;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
            ),
            Text(
              t.counterparty.label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w400,
                // The bar is white now; white70 made this line invisible.
                color: AqarColors.ink500,
              ),
            ),
          ],
        ),
        actions: const [LangToggleButton()],
      ),
      body: _error != null
          ? ErrorNotice(message: _error!, onRetry: _load)
          : Column(
              children: [
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : _messages.isEmpty
                      ? EmptyState(
                          title: tr(
                            'لسه مافيش رسايل',
                            'No messages yet',
                          ),
                          body: tr(
                            'اكتب سؤالك عن الوحدة تحت.',
                            'Write your question about the unit below.',
                          ),
                        )
                      : ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length,
                          itemBuilder: (_, i) => _Bubble(message: _messages[i]),
                        ),
                ),

                if (_notice != null)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Text(
                      _notice!,
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.5,
                        color: AqarColors.danger,
                      ),
                    ),
                  ),

                SafeArea(
                  top: false,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                    decoration: const BoxDecoration(
                      border: Border(top: BorderSide(color: AqarColors.border)),
                    ),
                    child: Column(
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _input,
                                minLines: 1,
                                maxLines: 4,
                                textInputAction: TextInputAction.newline,
                                decoration: InputDecoration(
                                  hintText: tr(
                                    'اكتب رسالتك…',
                                    'Write your message…',
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(
                              height: 48,
                              child: FilledButton(
                                onPressed: _sending ? null : _send,
                                child: const Icon(Icons.send, size: 18),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          tr(
                            'أرقام التليفون والإيميلات بتتشال أوتوماتيك. التواصل بيفضل جوه المنصة لحد ما المعاينة تتأكد.',
                            'Phone numbers and emails are removed automatically. Contact stays on the platform until a viewing is confirmed.',
                          ),
                          style: const TextStyle(
                            fontSize: 11,
                            height: 1.5,
                            color: AqarColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.mine;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        children: [
          Flexible(
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.78,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: mine ? AqarColors.navy700 : AqarColors.ink100,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    message.body,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.5,
                      color: mine ? Colors.white : AqarColors.ink900,
                    ),
                  ),
                  if (message.flagged && mine) ...[
                    const SizedBox(height: 5),
                    Text(
                      tr('اتعدّلت قبل ما توصل', 'Edited before delivery'),
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: Colors.white70,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
