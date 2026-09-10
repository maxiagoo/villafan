"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  MessageCircle,
  Send,
  RefreshCw,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Wallet,
  Undo2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney, parseCents, localDate, type RequestItem } from "./domain";
type Message = {
  id: string;
  request_id: string;
  sender_id: string;
  sender_role: "admin" | "client";
  body: string;
  created_at: string;
};
type Movement = {
  id: string;
  request_id: string | null;
  direction: "entrada" | "saida";
  amount_cents: number;
  description: string;
  method: string;
  occurred_on: string;
  recorded_at: string;
  recorded_by: string;
  reversal_of: string | null;
  reversal_reason: string | null;
};
const stamp = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const day = (s: string) => s.split("-").reverse().join("/");
const demoMessages: Message[] = [
  {
    id: "demo-message-1",
    request_id: "demo",
    sender_id: "demo-client",
    sender_role: "client",
    body: "Gostei deste modelo. Podemos conversar sobre as medidas e os acabamentos?",
    created_at: "2026-09-10T12:00:00Z",
  },
  {
    id: "demo-message-2",
    request_id: "demo",
    sender_id: "demo-admin",
    sender_role: "admin",
    body: "Claro! Envie as medidas aproximadas e me conte como pretende usar o espaço.",
    created_at: "2026-09-10T12:05:00Z",
  },
];
export function RequestChat({
  db,
  user,
  request,
  onClose,
}: {
  db: SupabaseClient | null;
  user: User | null;
  request: RequestItem;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(db ? [] : demoMessages),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!db),
    [sending, setSending] = useState(false),
    [more, setMore] = useState(false),
    [olderBusy, setOlderBusy] = useState(false);
  const firstPageLoaded = useRef(false);
  const pendingId = useRef<string | null>(null),
    pendingText = useRef(""),
    active = useRef(true),
    bottom = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const { data, error: err } = await db
        .from("request_messages")
        .select("*")
        .eq("request_id", request.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100);
      if (err) throw err;
      if (!active.current) return;
      const incoming = (data || []) as Message[];
      setMessages((current) => {
        const all = new Map(current.map((m) => [m.id, m]));
        for (const m of incoming) all.set(m.id, m);
        return [...all.values()].sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        );
      });
      if (!firstPageLoaded.current) {
        setMore(incoming.length === 100);
        firstPageLoaded.current = true;
      }
      setError("");
    } catch {
      if (active.current)
        setError("Não foi possível atualizar a conversa. Tente novamente.");
    } finally {
      if (active.current) setLoading(false);
    }
  }, [db, request.id]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (messages.length <= 100)
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  async function older() {
    if (!db || !messages[0]) return;
    setOlderBusy(true);
    const first = messages[0];
    const { data, error: err } = await db
      .from("request_messages")
      .select("*")
      .eq("request_id", request.id)
      .or(
        `created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`,
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (err) setError("Não foi possível carregar as mensagens anteriores.");
    else {
      setMessages((current) => [...(data || []).reverse(), ...current]);
      setMore((data || []).length === 100);
    }
    setOlderBusy(false);
  }
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || !user || !text.trim() || sending) return;
    setSending(true);
    setError("");
    if (pendingText.current !== text.trim()) {
      pendingId.current = null;
      pendingText.current = text.trim();
    }
    pendingId.current ??= crypto.randomUUID();
    const id = pendingId.current;
    try {
      const { error: err } = await db
        .from("request_messages")
        .insert({ id, request_id: request.id, body: text.trim() });
      if (err) {
        if (err.code !== "23505") throw err;
        const { data: existing } = await db
          .from("request_messages")
          .select("id,body,sender_id")
          .eq("id", id)
          .single();
        if (
          !existing ||
          existing.sender_id !== user.id ||
          existing.body !== text.trim()
        )
          throw err;
      }
      if (!active.current) return;
      setText("");
      pendingId.current = null;
      await refresh();
      bottom.current?.scrollIntoView({ block: "nearest" });
    } catch {
      if (active.current)
        setError(
          "Mensagem não confirmada. O texto foi mantido; tente novamente.",
        );
    } finally {
      if (active.current) setSending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="feature-dialog chat-dialog"
        showCloseButton={false}
      >
        <DialogClose className="feature-close" aria-label="Fechar conversa">
          <X />
        </DialogClose>
        <div>
          <span className="eyebrow">CONVERSA DA SOLICITAÇÃO</span>
          <DialogTitle className="feature-title">
            {request.environment} · {request.customer_name}
          </DialogTitle>
          <DialogDescription className="feature-description">
            {db
              ? "Conversa privada entre o cliente e a equipe Villafan. Atualização automática a cada 5 segundos."
              : "Conversa ilustrativa. O envio será ativado ao conectar as contas."}
          </DialogDescription>
        </div>
        <div className="chat-context">
          <span className="status">{request.status}</span>
          <p>{request.description}</p>
        </div>
        <div
          className="chat-messages"
          aria-label="Histórico da conversa"
          aria-live="polite"
          aria-relevant="additions"
        >
          {more && (
            <button className="secondary" disabled={olderBusy} onClick={older}>
              {olderBusy ? "Carregando…" : "Mensagens anteriores"}
            </button>
          )}
          {loading ? (
            <p>Carregando conversa…</p>
          ) : !messages.length ? (
            <div className="chat-empty">
              <MessageCircle />
              <p>Comece a conversa sobre este projeto.</p>
            </div>
          ) : (
            messages.map((m) => (
              <article
                className={
                  "bubble " +
                  (m.sender_id === user?.id
                    ? "mine"
                    : m.sender_role === "admin"
                      ? "from-admin"
                      : "")
                }
                key={m.id}
              >
                <strong>
                  {m.sender_id === user?.id
                    ? "Você"
                    : m.sender_role === "admin"
                      ? "Equipe Villafan"
                      : "Cliente"}
                </strong>
                <p>{m.body}</p>
                <time dateTime={m.created_at}>{stamp(m.created_at)}</time>
              </article>
            ))
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <div role="alert" className="feature-error">
            {error}
            <button
              onClick={() => void refresh()}
              aria-label="Atualizar conversa"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        )}
        <form className="chat-compose" onSubmit={send}>
          <label className="sr-only" htmlFor="chat-text">
            Mensagem
          </label>
          <textarea
            id="chat-text"
            rows={2}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Converse sobre medidas, materiais e detalhes…"
            disabled={sending}
            required
          />
          <button
            className="primary"
            disabled={!db || sending || !text.trim()}
            type="submit"
          >
            <Send size={18} />
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
const demoMovements: Movement[] = [
  {
    id: "demo-income",
    request_id: null,
    direction: "entrada",
    amount_cents: 450000,
    description: "Sinal do projeto de cozinha — exemplo",
    method: "Pix",
    occurred_on: "2026-09-10",
    recorded_at: "2026-09-10T13:00:00Z",
    recorded_by: "demo-admin",
    reversal_of: null,
    reversal_reason: null,
  },
  {
    id: "demo-expense",
    request_id: null,
    direction: "saida",
    amount_cents: 125000,
    description: "Compra de chapas e ferragens — exemplo",
    method: "Transferência",
    occurred_on: "2026-09-09",
    recorded_at: "2026-09-09T13:00:00Z",
    recorded_by: "demo-admin",
    reversal_of: null,
    reversal_reason: null,
  },
];
export function Finance({
  db,
  requests,
}: {
  db: SupabaseClient | null;
  requests: RequestItem[];
}) {
  const [rows, setRows] = useState<Movement[]>(db ? [] : demoMovements),
    [totals, setTotals] = useState({
      income: db ? 0 : 450000,
      expense: db ? 0 : 125000,
      count: db ? 0 : 2,
    }),
    [loading, setLoading] = useState(!!db),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [reversal, setReversal] = useState<Movement | null>(null),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(100),
    [success, setSuccess] = useState("");
  const pending = useRef<string | null>(null),
    active = useRef(true);
  const load = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const [entries, summary] = await Promise.all([
        db
          .from("money_movements")
          .select("*")
          .order("occurred_on", { ascending: false })
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, limit - 1),
        db.rpc("money_summary"),
      ]);
      if (entries.error) throw entries.error;
      if (summary.error) throw summary.error;
      if (active.current) {
        setRows(entries.data || []);
        setTotals(summary.data);
        setError("");
      }
    } catch {
      if (active.current)
        setError(
          "Não foi possível carregar o financeiro. Confira a conexão e tente novamente.",
        );
    } finally {
      if (active.current) setLoading(false);
    }
  }, [db, limit]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);
  async function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || busy) return;
    const f = new FormData(e.currentTarget),
      cents = parseCents(String(f.get("amount")));
    if (cents === null) {
      setError(
        "Informe um valor positivo com até duas casas decimais, como 1250,50.",
      );
      return;
    }
    setBusy(true);
    setError("");
    pending.current ??= crypto.randomUUID();
    try {
      const { error: err } = await db.rpc("record_movement", {
        p_id: pending.current,
        p_request_id: String(f.get("request")) || null,
        p_direction: String(f.get("direction")),
        p_amount_cents: cents,
        p_description: String(f.get("description")).trim(),
        p_method: String(f.get("method")),
        p_occurred_on: String(f.get("date")),
      });
      if (err) throw err;
      setOpen(false);
      pending.current = null;
      setSuccess("Movimentação registrada no histórico.");
      await load();
    } catch {
      setError(
        "Não foi possível confirmar o lançamento. Confira o histórico antes de mudar os dados e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reverse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || !reversal || busy) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const { error: err } = await db.rpc("reverse_movement", {
        p_id: reversal.id,
        p_reason: String(f.get("reason")).trim(),
      });
      if (err) throw err;
      setReversal(null);
      setSuccess(
        "Estorno registrado. O lançamento original permanece no histórico.",
      );
      await load();
    } catch {
      setError(
        "Não foi possível confirmar o estorno. Atualize o histórico e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="finance">
      <div className="section-heading">
        <div>
          <h2>Movimentação de dinheiro</h2>
          <p>Entradas e saídas registradas pela administração.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            pending.current = null;
            setError("");
            setOpen(true);
          }}
        >
          <Plus size={18} /> Registrar movimentação
        </button>
      </div>
      {!db && (
        <p className="feature-hint">
          Prévia com valores fictícios. Nenhuma movimentação real foi
          registrada.
        </p>
      )}
      {success && (
        <p role="status" className="feature-success">
          {success}
        </p>
      )}
      {error && !open && !reversal && (
        <div role="alert" className="feature-error">
          {error}
          <button onClick={() => void load()}>
            <RefreshCw size={18} /> Tentar novamente
          </button>
        </div>
      )}
      <div className="money-cards">
        <article>
          <ArrowDownLeft />
          <span>Total de entradas</span>
          <strong>{loading ? "…" : formatMoney(totals.income)}</strong>
        </article>
        <article>
          <ArrowUpRight />
          <span>Total de saídas</span>
          <strong>{loading ? "…" : formatMoney(totals.expense)}</strong>
        </article>
        <article className="balance">
          <Wallet />
          <span>Saldo dos lançamentos</span>
          <strong>
            {loading ? "…" : formatMoney(totals.income - totals.expense)}
          </strong>
        </article>
      </div>
      <p className="feature-hint">
        Acumulado de todo o histórico, incluindo estornos. Este saldo considera
        apenas os lançamentos registrados aqui.
      </p>
      <div className="section-heading">
        <h3>Histórico financeiro</h3>
        <button
          className="secondary"
          disabled={loading || !db}
          onClick={() => void load()}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {loading && !rows.length ? (
        <p role="status">Carregando movimentações…</p>
      ) : !rows.length ? (
        <div className="empty">
          <Wallet />
          <h3>Nenhuma movimentação registrada</h3>
          <p>Registre recebimentos e despesas para começar o histórico.</p>
        </div>
      ) : (
        <Table className="ledger">
          <TableHeader>
            <TableRow>
              <TableHead>Data / registro</TableHead>
              <TableHead>Descrição / pedido</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <time>{day(r.occurred_on)}</time>
                  <small>{stamp(r.recorded_at)}</small>
                </TableCell>
                <TableCell>
                  <strong>{r.description}</strong>
                  <small>
                    {r.request_id
                      ? (requests.find((q) => q.id === r.request_id)
                          ?.customer_name || "Pedido") +
                        " · #" +
                        r.request_id.slice(0, 8)
                      : "Sem pedido vinculado"}
                  </small>
                  <small>Registrado por #{r.recorded_by.slice(0, 8)}</small>
                  {r.reversal_reason && (
                    <small>Motivo: {r.reversal_reason}</small>
                  )}
                </TableCell>
                <TableCell>{r.method}</TableCell>
                <TableCell
                  className={
                    r.direction === "entrada" ? "money-in" : "money-out"
                  }
                >
                  {r.direction === "entrada" ? "+" : "−"}{" "}
                  {formatMoney(r.amount_cents)}
                  <small>
                    {r.reversal_of
                      ? "Estorno"
                      : r.direction === "entrada"
                        ? "Entrada"
                        : "Saída"}
                  </small>
                </TableCell>
                <TableCell>
                  {r.reversal_of ? (
                    <span className="feature-hint">Estorno registrado</span>
                  ) : rows.some((other) => other.reversal_of === r.id) ? (
                    <span className="feature-hint">Já estornado</span>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => {
                        setError("");
                        setReversal(r);
                      }}
                    >
                      <Undo2 size={15} /> Estornar
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length < totals.count && (
        <button
          className="secondary"
          disabled={loading}
          onClick={() => setLimit((l) => l + 100)}
        >
          Carregar mais lançamentos
        </button>
      )}
      <Dialog
        open={open || !!reversal}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setOpen(false);
            setReversal(null);
            setError("");
          }
        }}
      >
        <DialogContent className="feature-dialog" showCloseButton={false}>
          <DialogClose
            disabled={busy}
            className="feature-close"
            aria-label="Fechar"
          >
            <X />
          </DialogClose>
          <DialogTitle className="feature-title">
            {reversal ? "Estornar movimentação" : "Registrar movimentação"}
          </DialogTitle>
          <DialogDescription className="feature-description">
            {reversal
              ? "O histórico será preservado com um lançamento de mesmo valor e sentido oposto."
              : "Registre um valor já recebido ou pago. Não realiza cobranças nem transferências."}
          </DialogDescription>
          {reversal ? (
            <form onSubmit={reverse}>
              <p>
                {reversal.description} ·{" "}
                <strong>{formatMoney(reversal.amount_cents)}</strong>
              </p>
              <label>
                Motivo do estorno
                <textarea
                  name="reason"
                  rows={3}
                  required
                  minLength={3}
                  maxLength={300}
                />
              </label>
              <button className="primary full" disabled={!db || busy}>
                {busy ? "Registrando…" : "Confirmar estorno"}
              </button>
            </form>
          ) : (
            <form onSubmit={record}>
              <div className="form-row">
                <label>
                  Tipo
                  <select name="direction">
                    <option value="entrada">Entrada — recebimento</option>
                    <option value="saida">Saída — pagamento</option>
                  </select>
                </label>
                <label>
                  Valor (R$)
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                    maxLength={14}
                  />
                </label>
              </div>
              <label>
                Descrição
                <input
                  name="description"
                  required
                  minLength={3}
                  maxLength={300}
                  placeholder="Ex.: sinal da cozinha planejada"
                />
              </label>
              <div className="form-row">
                <label>
                  Data da movimentação
                  <input
                    name="date"
                    type="date"
                    required
                    max={localDate()}
                    defaultValue={localDate()}
                  />
                </label>
                <label>
                  Forma
                  <select name="method">
                    {[
                      "Pix",
                      "Dinheiro",
                      "Cartão",
                      "Transferência",
                      "Outro",
                    ].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Vincular a um pedido
                <select name="request">
                  <option value="">Sem pedido vinculado</option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.customer_name} · {r.environment} · #{r.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary full" disabled={!db || busy}>
                {busy ? "Registrando…" : "Salvar no histórico"}
              </button>
            </form>
          )}
          {!db && (
            <p className="feature-hint">Gravação desativada nesta prévia.</p>
          )}
          {error && (
            <p role="alert" className="feature-error">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
