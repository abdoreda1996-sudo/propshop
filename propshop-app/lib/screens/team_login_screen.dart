import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';

/// Email + password sign-in for the PropShop team (admin, reviewer, advisor) — the same
/// accounts and endpoint as the website's back office. Pops with `true` once signed in.
class TeamLoginScreen extends StatefulWidget {
  const TeamLoginScreen({super.key});

  @override
  State<TeamLoginScreen> createState() => _TeamLoginScreenState();
}

class _TeamLoginScreenState extends State<TeamLoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String _message(String code) {
    switch (code) {
      case 'invalid_credentials':
        return tr('الإيميل أو كلمة السر غلط.', 'Wrong email or password.');
      case 'missing_credentials':
        return tr('اكتب الإيميل وكلمة السر.', 'Enter your email and password.');
      case 'account_blocked':
        return tr('الحساب ده موقوف.', 'This account is suspended.');
      case 'too_many_requests':
        return tr('محاولات كتير. استنى شوية وجرّب تاني.', 'Too many attempts. Wait a little and try again.');
      case 'network_error':
        return tr('مش قادرين نوصل للسيرفر. اتأكد من الإنترنت.', "We can't reach the server. Check your internet connection.");
      default:
        return tr('حصل خطأ غير متوقع ($code).', 'Something unexpected went wrong ($code).');
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().loginWithPassword(_email.text.trim(), _password.text);
      if (!mounted) return;
      await context.read<SessionController>().refresh();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('دخول فريق العمل', 'Team sign-in')),
        actions: const [LangToggleButton()],
      ),
      body: AutofillGroup(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              tr('دخول فريق بروب شوب', 'PropShop team sign-in'),
              style: const TextStyle(fontSize: 22, height: 1.25, fontWeight: FontWeight.w700, color: AqarColors.ink900),
            ),
            const SizedBox(height: 8),
            Text(
              tr(
                'للمراجعين والمستشارين والإدارة بس. نفس حساب لوحة التحكم على الموقع.',
                'For reviewers, advisors and admins only. The same account as the website control panel.',
              ),
              style: const TextStyle(fontSize: 14, height: 1.55, color: AqarColors.textMuted),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: tr('الإيميل', 'Email')),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: _obscure,
              textDirection: TextDirection.ltr,
              autofillHints: const [AutofillHints.password],
              onSubmitted: (_) => _busy ? null : _submit(),
              decoration: InputDecoration(
                labelText: tr('كلمة السر', 'Password'),
                suffixIcon: IconButton(
                  tooltip: _obscure ? tr('إظهار', 'Show') : tr('إخفاء', 'Hide'),
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(_message(_error!), style: const TextStyle(fontSize: 13, color: AqarColors.danger)),
            ],
            const SizedBox(height: 22),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_busy ? tr('جاري…', 'Working…') : tr('دخول', 'Sign in')),
            ),
          ],
        ),
      ),
    );
  }
}
