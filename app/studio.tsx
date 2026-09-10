"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import Portal from "./portal";
import type { Project, RequestItem } from "./domain";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  Upload,
  LogOut,
  ShieldCheck,
  Armchair,
} from "lucide-react";
const examples: Project[] = [
  {
    id: "ex1",
    title: "Cozinha em equilíbrio",
    category: "Cozinhas",
    description:
      "Madeira clara, linhas retas e espaço para a rotina acontecer.",
    price_min: 18000,
    price_max: 28000,
    tone: "sand",
  },
  {
    id: "ex2",
    title: "Um quarto para desacelerar",
    category: "Quartos",
    description: "Armário do piso ao teto com espaço bem aproveitado.",
    price_min: 12000,
    price_max: 20000,
    tone: "olive",
  },
  {
    id: "ex3",
    title: "Seu espaço de concentração",
    category: "Escritórios",
    description: "Bancada sob medida, nichos abertos e organização.",
    price_min: 6500,
    price_max: 11000,
    tone: "clay",
  },
  {
    id: "ex4",
    title: "Sala com personalidade",
    category: "Salas",
    description: "Painel amadeirado e armazenamento que integra o ambiente.",
    price_min: 8000,
    price_max: 15000,
    tone: "walnut",
  },
];
const categories = ["Todos", "Cozinhas", "Quartos", "Salas", "Escritórios"];
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
function Room({ project }: { project: Project }) {
  const kitchen = project.category === "Cozinhas";
  return (
    <div
      className={"room " + project.tone}
      aria-label={"Ilustração de " + project.category}
    >
      <div className="room-window" />
      <div className="room-floor" />
      <div className="cabinet upper">
        <i />
        <i />
        <i />
      </div>
      <div className={"cabinet lower " + (!kitchen ? "wide" : "")}>
        <i />
        <i />
        <i />
        <i />
      </div>
      {kitchen ? (
        <>
          <div className="counter" />
          <div className="faucet" />
        </>
      ) : (
        <>
          <div className="shelf" />
          <div className="vase" />
        </>
      )}
      <div className="plant">
        <i />
        <i />
        <i />
      </div>
      <span className="room-label">ESTUDO DE AMBIENTE</span>
    </div>
  );
}
export default function Studio({
  url,
  apiKey,
  initialView = "ideas",
}: {
  url: string;
  apiKey: string;
  initialView?: string;
}) {
  const [db] = useState<SupabaseClient | null>(() =>
    url && apiKey
      ? createClient(url, apiKey, {
          auth: { flowType: "pkce", detectSessionInUrl: true },
        })
      : null,
  );
  const [roleLoading, setRoleLoading] = useState(!!db);
  const [user, setUser] = useState<User | null>(null),
    [admin, setAdmin] = useState(false),
    [view, setView] = useState(initialView),
    [category, setCategory] = useState("Todos"),
    [projects, setProjects] = useState<Project[]>(db ? [] : examples),
    [requests, setRequests] = useState<RequestItem[]>([]),
    [modal, setModal] = useState<"login" | "request" | "project" | null>(null),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<Project | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [loading, setLoading] = useState(!!db);
  async function loadRequests() {
    if (!db) return;
    setLoading(true);
    const { data, error } = await db
      .from("requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error)
      setNotice("Não foi possível carregar os pedidos. Tente novamente.");
    else setRequests(data || []);
    setLoading(false);
  }
  async function loadProjects() {
    if (!db) return;
    const { data, error } = await db
      .from("projects")
      .select("*")
      .order("created_at");
    if (error)
      setNotice("Não foi possível carregar os projetos. Tente novamente.");
    else setProjects(data || []);
    setLoading(false);
  }
  useEffect(() => {
    if (!db) return;
    void loadProjects();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAdmin(false);
      setRequests([]);
      setRoleLoading(!!session?.user);
    });
    db.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) setRoleLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [db]);
  useEffect(() => {
    if (!db || !user) {
      setAdmin(false);
      setRequests([]);
      return;
    }
    setRoleLoading(true);
    let active = true;
    db.from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setAdmin(!!data);
          setRoleLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [db, user]);
  useEffect(() => {
    if (user && (view === "requests" || view === "admin")) void loadRequests();
  }, [user, view, admin]);
  function openRequest(p: Project | null = null) {
    setSelected(p);
    setFiles([]);
    setNotice("");
    setModal(user || !db ? "request" : "login");
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) {
      setNotice(
        "O login estará disponível após a configuração do serviço de contas.",
      );
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const f = new FormData(e.currentTarget);
      const email = String(f.get("email")),
        password = String(f.get("password"));
      const result = signup
        ? await db.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: { full_name: String(f.get("name")) },
            },
          })
        : await db.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setNotice(
          "Confira seu e-mail para confirmar o cadastro e depois entre na sua conta.",
        );
      else {
        setModal(null);
        if (initialView === "admin") setView("admin");
        setNotice("Você entrou na sua conta.");
      }
    } catch {
      setNotice(
        signup
          ? "Não foi possível cadastrar. Confira os dados e tente novamente."
          : "Não foi possível entrar. Confira seu e-mail e senha.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    if (!db) {
      setNotice(
        "O login com Google estará disponível após a configuração do serviço de contas.",
      );
      return;
    }
    setBusy(true);
    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          window.location.origin + (initialView === "admin" ? "/admin" : "/"),
      },
    });
    if (error) {
      setNotice("Não foi possível iniciar o login com Google.");
      setBusy(false);
    }
  }
  async function submitRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || !user) return;
    setBusy(true);
    setNotice("");
    const form = new FormData(e.currentTarget),
      id = crypto.randomUUID();
    const paths: string[] = [];
    try {
      const { error } = await db
        .from("requests")
        .insert({
          id,
          user_id: user.id,
          customer_name: String(form.get("name")),
          contact: String(form.get("contact")),
          environment: String(form.get("environment")),
          description: String(form.get("description")),
          project_id:
            selected && !selected.id.startsWith("ex") ? selected.id : null,
        });
      if (error) throw error;
      for (const file of files) {
        const ext =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpg";
        const path = `${user.id}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage
          .from("request-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        paths.push(path);
      }
      if (paths.length) {
        const { error: photoError } = await db
          .from("request_photos")
          .insert(paths.map((path) => ({ request_id: id, path })));
        if (photoError) throw photoError;
      }
      setModal(null);
      setFiles([]);
      setView("requests");
      await loadRequests();
      setNotice(
        "Solicitação enviada. Você pode acompanhar o andamento por aqui.",
      );
    } catch {
      if (paths.length) await db.storage.from("request-photos").remove(paths);
      const { error: cleanupError } = await db
        .from("requests")
        .delete()
        .eq("id", id)
        .eq("status", "Recebida");
      setNotice(
        cleanupError
          ? "O pedido pode ter sido criado sem as fotos. Confira Minhas solicitações antes de reenviar."
          : "Não foi possível enviar. Seus dados continuam no formulário para tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(id: string, status: string) {
    if (!db) return;
    setBusy(true);
    const { error } = await db.from("requests").update({ status }).eq("id", id);
    if (error) setNotice("Não foi possível atualizar o andamento.");
    else await loadRequests();
    setBusy(false);
  }
  async function saveProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || !admin) return;
    setBusy(true);
    const f = new FormData(e.currentTarget),
      min = Number(f.get("min")),
      max = Number(f.get("max"));
    if (max < min) {
      setNotice("O valor máximo deve ser maior ou igual ao mínimo.");
      setBusy(false);
      return;
    }
    const values = {
      title: String(f.get("title")),
      category: String(f.get("category")),
      description: String(f.get("description")),
      price_min: min,
      price_max: max,
      tone: String(f.get("tone")),
    };
    const { error } = selected
      ? await db.from("projects").update(values).eq("id", selected.id)
      : await db.from("projects").insert(values);
    if (error) setNotice("Não foi possível salvar o projeto.");
    else {
      await loadProjects();
      setModal(null);
      setNotice("Projeto salvo no catálogo.");
    }
    setBusy(false);
  }
  return (
    <div className="site">
      <header className="header">
        <a className="brand" href="/" aria-label="Villafan Planejados, início">
          <span className="brand-mark">
            V<span>.</span>
          </span>
          <span>
            VILLAFAN<small>PLANEJADOS</small>
          </span>
        </a>
        <nav aria-label="Principal">
          <button
            className={view === "ideas" ? "active" : ""}
            onClick={() => setView("ideas")}
          >
            Inspirações
          </button>
          <button
            className={view === "requests" ? "active" : ""}
            onClick={() => {
              setView("requests");
              if (!user && db) setModal("login");
            }}
          >
            Minhas solicitações
          </button>
          {(admin || !db) && (
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              {db ? "Administração" : "Prévia admin"}
            </button>
          )}
        </nav>
        {user ? (
          <button
            className="account"
            onClick={async () => {
              if (db) {
                const { error } = await db.auth.signOut();
                if (error) {
                  setNotice("Não foi possível sair. Tente novamente.");
                  return;
                }
              }
              setView("ideas");
              setNotice("Você saiu da conta.");
            }}
          >
            {user.user_metadata?.full_name?.split(" ")[0] || "Minha conta"}{" "}
            <LogOut size={16} />
          </button>
        ) : (
          <button
            className="account"
            onClick={() => {
              setNotice("");
              setModal("login");
            }}
          >
            Entrar <ArrowUpRight size={17} />
          </button>
        )}
      </header>
      {!db && (
        <div className="preview-note">
          Prévia em desenvolvimento · ambientes e valores ilustrativos · contas
          e envio ainda não ativados
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Fechar mensagem" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <main>
        {view === "ideas" ? (
          <>
            <section className="intro">
              <div>
                <span className="eyebrow">DO SEU JEITO. SOB MEDIDA.</span>
                <h1>
                  Seu espaço.
                  <br />
                  <em>Novas possibilidades.</em>
                </h1>
                <p>
                  Explore ideias para sua casa e dê o primeiro passo
                  <br className="desktop" /> para tirar seu projeto do papel.
                </p>
              </div>
              <div className="intro-action">
                <span className="mini-sketch">
                  <Armchair size={45} strokeWidth={1} />
                </span>
                <p>Já tem uma ideia em mente?</p>
                <button className="primary" onClick={() => openRequest()}>
                  Solicitar meu projeto <ArrowUpRight size={19} />
                </button>
              </div>
            </section>
            <section className="catalog">
              <div className="catalog-head">
                <div>
                  <span className="eyebrow">UM PONTO DE PARTIDA</span>
                  <h2>Inspire seu próximo ambiente</h2>
                </div>
                <span className="count">
                  {projects.length.toString().padStart(2, "0")} ideias para
                  explorar
                </span>
              </div>
              <div className="filters" aria-label="Filtrar ambientes">
                {categories.map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    className={category === c ? "chosen" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {loading ? (
                <p role="status">Carregando projetos…</p>
              ) : (
                <div className="project-grid">
                  {projects
                    .filter(
                      (p) => category === "Todos" || p.category === category,
                    )
                    .map((p, i) => (
                      <article className="project" key={p.id}>
                        <button
                          className="room-button"
                          onClick={() => openRequest(p)}
                          aria-label={
                            "Solicitar projeto inspirado em " + p.title
                          }
                        >
                          <Room project={p} />
                          <span className="image-arrow">
                            <ArrowUpRight size={22} />
                          </span>
                        </button>
                        <div className="project-meta">
                          <span>{p.category}</span>
                          <span>0{i + 1}</span>
                        </div>
                        <h3>{p.title}</h3>
                        <p>{p.description}</p>
                        <div className="project-bottom">
                          <div>
                            <small>INVESTIMENTO ESTIMADO</small>
                            <strong>
                              {money(p.price_min)} <span>—</span>{" "}
                              {money(p.price_max)}
                            </strong>
                          </div>
                          <button
                            aria-label={"Solicitar " + p.title}
                            onClick={() => openRequest(p)}
                          >
                            <Plus size={20} />
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              )}
              {!loading &&
                !projects.filter(
                  (p) => category === "Todos" || p.category === category,
                ).length && (
                  <div className="empty">
                    Ainda não há projetos neste ambiente.
                  </div>
                )}
              <p className="price-note">
                Os valores são referências iniciais. O orçamento final considera
                medidas, materiais, acabamentos e instalação.
              </p>
            </section>
            <section className="bottom-cta">
              <span className="eyebrow">DA INSPIRAÇÃO AO SEU LAR</span>
              <h2>
                Conte o que você imagina.
                <br />O projeto começa por aí.
              </h2>
              <button onClick={() => openRequest()}>
                Enviar minha ideia <ArrowRight size={20} />
              </button>
            </section>
          </>
        ) : (
          <Portal
            key={view + ":" + (user?.id || "anonymous") + ":" + admin}
            db={db}
            user={user}
            admin={admin}
            roleLoading={roleLoading}
            adminView={view === "admin"}
            requests={requests}
            projects={projects}
            loading={loading}
            onNew={() => openRequest()}
            onLogin={() => {
              setSignup(false);
              setModal("login");
            }}
            onStatus={changeStatus}
            onReload={loadRequests}
            onNotice={setNotice}
            catalog={
              <div className="admin-catalog">
                <div>
                  <ShieldCheck size={22} />
                  <h2>Catálogo de inspirações</h2>
                  <button
                    className="primary"
                    onClick={() => {
                      setSelected(null);
                      setNotice("");
                      setModal("project");
                    }}
                  >
                    <Plus size={17} /> Adicionar projeto
                  </button>
                </div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="edit-row"
                    onClick={() => {
                      setSelected(p);
                      setNotice("");
                      setModal("project");
                    }}
                  >
                    <span>{p.title}</span>
                    <span>
                      Editar <ArrowUpRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            }
          />
        )}
      </main>
      <footer>
        <span>
          VILLAFAN <small>PLANEJADOS</small>
        </span>
        <p>Espaços pensados para a sua vida.</p>
        <a href="/admin">Acesso administrativo</a>
        <span>© {new Date().getFullYear()}</span>
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setModal(null);
              if (e.key === "Tab") {
                const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
                );
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              className="close"
              disabled={busy}
              onClick={() => setModal(null)}
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
            {modal === "login" ? (
              <>
                <span className="eyebrow">BEM-VINDO À VILLAFAN</span>
                <h2 id="modal-title">
                  {initialView === "admin"
                    ? "Acesso administrativo"
                    : signup
                      ? "Vamos criar sua conta?"
                      : "Seu próximo projeto começa aqui."}
                </h2>
                <p>
                  {initialView === "admin"
                    ? "Entre com a conta autorizada da administração."
                    : "Salve suas solicitações e acompanhe cada etapa."}
                </p>
                <button className="google" disabled={busy} onClick={google}>
                  <b>G</b> Continuar com Google
                </button>
                <div className="divider">ou use seu e-mail</div>
                <form onSubmit={authenticate}>
                  {signup && (
                    <label>
                      Seu nome
                      <input
                        autoFocus
                        name="name"
                        required
                        maxLength={100}
                        autoComplete="name"
                      />
                    </label>
                  )}
                  <label>
                    E-mail
                    <input
                      autoFocus={!signup}
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      placeholder="voce@exemplo.com"
                    />
                  </label>
                  <label>
                    Senha
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete={
                        signup ? "new-password" : "current-password"
                      }
                      placeholder="Pelo menos 8 caracteres"
                    />
                  </label>
                  <button className="primary full" disabled={busy}>
                    {busy
                      ? "Aguarde…"
                      : signup
                        ? "Criar minha conta"
                        : "Entrar"}{" "}
                    <ArrowRight size={18} />
                  </button>
                </form>
                {initialView !== "admin" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setSignup(!signup);
                      setNotice("");
                    }}
                  >
                    {signup
                      ? "Já tem conta? Entrar"
                      : "Primeira vez aqui? Criar conta"}
                  </button>
                )}
              </>
            ) : modal === "request" ? (
              <>
                <span className="eyebrow">VAMOS CONHECER SUA IDEIA</span>
                <h2 id="modal-title">Seu projeto começa aqui.</h2>
                <p>
                  {selected
                    ? "Inspiração: " + selected.title
                    : "Conte um pouco sobre o ambiente e o que você precisa."}
                </p>
                <form onSubmit={submitRequest}>
                  <div className="form-row">
                    <label>
                      Seu nome
                      <input
                        autoFocus
                        name="name"
                        defaultValue={user?.user_metadata?.full_name || ""}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Telefone ou WhatsApp
                      <input
                        name="contact"
                        type="tel"
                        required
                        minLength={8}
                        maxLength={30}
                        placeholder="(11) 99999-9999"
                      />
                    </label>
                  </div>
                  <label>
                    Ambiente
                    <select
                      name="environment"
                      defaultValue={selected?.category || "Cozinhas"}
                    >
                      {categories.slice(1).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                      <option>Outro ambiente</option>
                    </select>
                  </label>
                  <label>
                    O que você gostaria de fazer?
                    <textarea
                      name="description"
                      required
                      minLength={20}
                      maxLength={5000}
                      rows={4}
                      placeholder="Descreva o móvel, suas necessidades e, se souber, as medidas do espaço."
                    />
                  </label>
                  <label className="upload">
                    <Upload size={24} />
                    <strong>Adicione fotos do ambiente</strong>
                    <span>Até 5 fotos · JPG, PNG ou WebP · 5 MB cada</span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        if (
                          picked.length > 5 ||
                          picked.some(
                            (f) =>
                              f.size > 5 * 1024 * 1024 ||
                              ![
                                "image/jpeg",
                                "image/png",
                                "image/webp",
                              ].includes(f.type),
                          )
                        ) {
                          setNotice(
                            "Selecione até 5 imagens JPG, PNG ou WebP de até 5 MB cada.",
                          );
                          e.target.value = "";
                          setFiles([]);
                          return;
                        }
                        setFiles(picked);
                      }}
                    />
                  </label>
                  {files.map((f) => (
                    <small key={f.name + f.size} className="file-name">
                      {f.name}
                    </small>
                  ))}
                  <p className="subtle">
                    As fotos ficam restritas a você e à equipe responsável pelo
                    seu pedido.
                  </p>
                  <button className="primary full" disabled={busy || !db}>
                    {busy ? "Enviando…" : "Enviar solicitação"}
                    <ArrowUpRight size={18} />
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="eyebrow">CATÁLOGO</span>
                <h2 id="modal-title">
                  {selected ? "Editar inspiração" : "Nova inspiração"}
                </h2>
                <form onSubmit={saveProject}>
                  <label>
                    Título
                    <input
                      autoFocus
                      name="title"
                      defaultValue={selected?.title}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Ambiente
                    <select name="category" defaultValue={selected?.category}>
                      {categories.slice(1).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descrição
                    <textarea
                      name="description"
                      required
                      rows={3}
                      defaultValue={selected?.description}
                      maxLength={500}
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Valor mínimo (R$)
                      <input
                        name="min"
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        defaultValue={selected?.price_min}
                      />
                    </label>
                    <label>
                      Valor máximo (R$)
                      <input
                        name="max"
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        defaultValue={selected?.price_max}
                      />
                    </label>
                  </div>
                  <label>
                    Acabamento da ilustração
                    <select name="tone" defaultValue={selected?.tone || "sand"}>
                      <option value="sand">Madeira clara</option>
                      <option value="olive">Verde oliva</option>
                      <option value="clay">Argila</option>
                      <option value="walnut">Nogueira</option>
                    </select>
                  </label>
                  <button className="primary full" disabled={busy || !db}>
                    {busy ? "Salvando…" : "Salvar projeto"}
                  </button>
                </form>
              </>
            )}
            {!db && (
              <p className="subtle">
                Prévia: conecte o serviço de contas para ativar login, envio e
                alterações.
              </p>
            )}
            {notice && (
              <p className="form-notice" role="status">
                {notice}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
