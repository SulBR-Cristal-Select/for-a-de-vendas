import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button, Callout, Card, Page, PageHeading, TextField, ThemeToggle } from '@g4ai/ds';
import SulApp, { createAppState } from './SulApp';
import { supabase } from '../lib/supabase';
import { erpClient } from '../lib/erp-online';
import { loadWorkspace, saveWorkspace, WorkspaceError } from '../lib/workspace';

export default function WorkspaceRoot() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [state, setState] = useState<{ owner: string; value: Record<string, any> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true, sessionChanged = false, currentIdentity: string | null = null;
    const acceptSession = (next: Session | null) => {
      const identity = next?.user.id ?? null;
      erpClient.setIdentity(identity);
      if (identity !== currentIdentity) setState(null);
      currentIdentity = identity;
      setSession(next);
      setInitialized(true);
    };
    void supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!alive || sessionChanged) return;
      if (authError) setError('Não foi possível recuperar a sessão. Entre novamente.');
      acceptSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) { sessionChanged = true; acceptSession(next); }
    });
    return () => { alive = false; data.subscription.unsubscribe(); erpClient.setIdentity(null); };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    let alive = true;
    setState(null);
    setPending(false);
    if (!userId) return;
    setLoading(true);
    setError('');
    void loadWorkspace().then((remote) => {
      if (alive) setState({ owner: userId, value: createAppState(remote) });
    }).catch((cause: unknown) => {
      if (!alive) return;
      setPending(cause instanceof WorkspaceError && cause.code === 'MEMBERSHIP_PENDING');
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os dados da SulBR.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, reload]);

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setState(null);
    setPassword('');
    setError('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError(''); setMessage('');
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (authError) throw authError;
        if (!data.session) setMessage('Confirme seu e-mail pelo link recebido. Depois, entre aqui. O acesso à empresa depende da ativação pelo administrador.');
      }
      setPassword('');
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
      const messages: Record<string, string> = {
        invalid_credentials: 'E-mail ou senha incorretos.',
        email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
        signup_disabled: 'O cadastro de novos acessos está desabilitado.',
        weak_password: 'A senha não atende aos requisitos do serviço de autenticação.',
        over_email_send_rate_limit: 'Aguarde alguns minutos antes de solicitar outro e-mail.',
        over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        email_address_invalid: 'Informe um e-mail válido.',
        user_already_exists: 'Já existe um acesso para este e-mail. Escolha Entrar.',
        email_exists: 'Já existe um acesso para este e-mail. Escolha Entrar.',
      };
      setError(messages[code] || 'Não foi possível concluir o acesso. Confira seus dados ou tente novamente.');
    } finally { setSubmitting(false); }
  }

  if (session && state?.owner === session.user.id) return <SulApp key={session.user.id + ':' + reload} initialState={state.value} online={erpClient} persist={saveWorkspace} onSignOut={signOut} />;
  return <Page width="narrow">
    <PageHeading title="Sul · Força de Vendas" description="SulBR" />
    <Card className="space-y-5">
      {!initialized || loading ? <p className="text-body">{loading ? 'Carregando os dados da empresa…' : 'Verificando sessão…'}</p> : session ? <>
        <Callout tone={pending ? 'warn' : 'bad'} title={pending ? 'Acesso pendente de ativação' : 'Não foi possível carregar a empresa'}>{error}</Callout>
        <p className="text-caption text-muted">{session.user.email}</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setReload((value) => value + 1)}>Verificar acesso</Button>
          <Button variant="ghost" onClick={() => void signOut().catch(() => setError('Não foi possível encerrar a sessão.'))}>Sair</Button>
        </div>
      </> : <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <h2 className="text-title">{mode === 'login' ? 'Entrar' : 'Criar acesso'}</h2>
        {error && <Callout tone="bad">{error}</Callout>}
        {message && <Callout tone="info">{message}</Callout>}
        <TextField label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <TextField label="Senha" type="password" value={password} onChange={setPassword} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={submitting || !email.trim() || !password} disabledReason={submitting ? 'Aguarde a confirmação do acesso.' : 'Informe e-mail e senha.'}>{submitting ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar acesso'}</Button>
          <Button type="button" variant="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Criar acesso' : 'Já tenho acesso'}</Button>
        </div>
        {mode === 'register' && <p className="text-caption text-muted">O cadastro não concede acesso automático aos dados da SulBR. A ativação é feita pelo administrador.</p>}
      </form>}
    </Card>
    <div className="mt-6"><ThemeToggle compact /></div>
  </Page>;
}
