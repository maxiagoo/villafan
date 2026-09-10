"use client";
import { useState, type ReactNode } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  MessageCircle,
  Plus,
  ClipboardList,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Finance, RequestChat } from "./features";
import type { Project, RequestItem } from "./domain";
export const previewRequests: RequestItem[] = [
  {
    id: "demo-request",
    user_id: "demo-client",
    project_id: "ex1",
    customer_name: "Cliente de exemplo",
    contact: "Contato ilustrativo",
    environment: "Cozinhas",
    description:
      "Gostaria de uma cozinha sob medida com espaço para os eletrodomésticos. Quero conversar sobre medidas, materiais e acabamentos.",
    status: "Em análise",
    created_at: "2026-09-10T12:00:00Z",
  },
];
export default function Portal({
  db,
  user,
  admin,
  roleLoading,
  adminView,
  requests,
  projects,
  loading,
  catalog,
  onNew,
  onLogin,
  onStatus,
  onReload,
  onNotice,
}: {
  db: SupabaseClient | null;
  user: User | null;
  admin: boolean;
  roleLoading: boolean;
  adminView: boolean;
  requests: RequestItem[];
  projects: Project[];
  loading: boolean;
  catalog: ReactNode;
  onNew: () => void;
  onLogin: () => void;
  onStatus: (id: string, status: string) => Promise<void>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [chat, setChat] = useState<RequestItem | null>(null),
    [photos, setPhotos] = useState<Record<string, string[]>>({}),
    [statusBusy, setStatusBusy] = useState<string | null>(null),
    [statusError, setStatusError] = useState("");
  const visible = db ? requests : previewRequests;
  async function openPhotos(r: RequestItem) {
    if (!db) {
      onNotice("As fotos reais aparecerão após o envio de uma solicitação.");
      return;
    }
    const { data, error } = await db
      .from("request_photos")
      .select("path")
      .eq("request_id", r.id);
    if (error) {
      onNotice("Não foi possível carregar as fotos.");
      return;
    }
    if (!data?.length) {
      onNotice("Esta solicitação não tem fotos.");
      return;
    }
    const { data: signed, error: err } = await db.storage
      .from("request-photos")
      .createSignedUrls(
        data.map((p) => p.path),
        120,
      );
    if (err) {
      onNotice("Não foi possível abrir as fotos.");
      return;
    }
    setPhotos((p) => ({
      ...p,
      [r.id]: (signed || [])
        .map((p) => p.signedUrl)
        .filter((s): s is string => typeof s === "string"),
    }));
  }
  const list = (
    <>
      <div className="section-heading">
        <div>
          <h2>
            {adminView ? "Pedidos dos clientes" : "Acompanhe seus pedidos"}
          </h2>
          <p>
            {adminView
              ? "Abra um pedido para conversar com o cliente."
              : "Cada projeto tem seu próprio histórico e conversa com a equipe."}
          </p>
        </div>
        <button
          className="secondary"
          disabled={!db || loading}
          onClick={() => void onReload()}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {statusError && (
        <p className="feature-error" role="alert">
          {statusError}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando solicitações…</p>
      ) : !visible.length ? (
        <div className="empty">
          <ClipboardList />
          <h2>Nenhum pedido por enquanto</h2>
          <p>
            {adminView
              ? "As novas solicitações aparecerão aqui."
              : "Escolha uma inspiração ou envie sua ideia para iniciar uma conversa."}
          </p>
        </div>
      ) : (
        <div className="requests">
          {visible.map((r) => (
            <article key={r.id} className="request-card">
              <div className="request-top">
                <span className="eyebrow">{r.environment}</span>
                <span className="status">{r.status}</span>
              </div>
              <h3>
                {adminView ? r.customer_name : r.environment + " sob medida"}
              </h3>
              {r.project_id && (
                <p className="request-project">
                  Inspiração:{" "}
                  {projects.find((p) => p.id === r.project_id)?.title ||
                    "Projeto do catálogo"}
                </p>
              )}
              <p className="request-description">{r.description}</p>
              {adminView && <p className="subtle">Contato: {r.contact}</p>}
              <div className="request-bottom">
                <small>
                  {new Date(r.created_at).toLocaleDateString("pt-BR")} · #
                  {r.id.slice(0, 8)}
                </small>
                <button onClick={() => void openPhotos(r)}>
                  Ver fotos <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="request-actions">
                <button className="primary" onClick={() => setChat(r)}>
                  <MessageCircle size={18} />
                  {adminView
                    ? "Conversar com cliente"
                    : "Conversar com a equipe"}
                </button>
                {adminView && (admin || !db) && (
                  <label>
                    Andamento
                    <select
                      value={r.status}
                      disabled={!db || statusBusy === r.id}
                      onChange={async (e) => {
                        setStatusBusy(r.id);
                        setStatusError("");
                        try {
                          await onStatus(r.id, e.target.value);
                        } catch {
                          setStatusError(
                            "Não foi possível atualizar o pedido.",
                          );
                        } finally {
                          setStatusBusy(null);
                        }
                      }}
                    >
                      {[
                        "Recebida",
                        "Em análise",
                        "Orçamento enviado",
                        "Concluída",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {photos[r.id] && (
                <div className="request-photos">
                  {photos[r.id].map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      <img
                        src={src}
                        alt="Foto do ambiente enviada pelo cliente"
                      />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
  return (
    <section className="workspace portal">
      <span className="eyebrow">
        {adminView ? "ÁREA ADMINISTRATIVA" : "ÁREA DO CLIENTE"}
      </span>
      <div className="workspace-heading">
        <h1>{adminView ? "Gestão Villafan" : "Minhas solicitações"}</h1>
        {!adminView && (
          <button className="primary" onClick={onNew}>
            <Plus size={18} /> Nova solicitação
          </button>
        )}
      </div>
      {db && roleLoading ? (
        <p role="status">Verificando sua conta…</p>
      ) : db && !user ? (
        <div className="empty">
          <ClipboardList />
          <h2>
            {adminView ? "Acesso do administrador" : "Entre na sua conta"}
          </h2>
          <p>
            {adminView
              ? "Use a conta autorizada para gerenciar pedidos, conversas e movimentações."
              : "Acompanhe somente os seus pedidos e fale com a equipe."}
          </p>
          <button className="primary" onClick={onLogin}>
            {adminView ? "Entrar como administrador" : "Entrar na minha conta"}
          </button>
        </div>
      ) : db && adminView && !admin ? (
        <div className="empty">
          <h2>Esta conta é de cliente</h2>
          <p>O painel é exclusivo das contas autorizadas pela administração.</p>
          <a className="primary" href="/">
            Voltar ao catálogo
          </a>
        </div>
      ) : adminView ? (
        <Tabs defaultValue="orders" className="admin-tabs">
          <TabsList className="portal-tabs" aria-label="Áreas administrativas">
            <TabsTrigger value="orders">Pedidos e conversas</TabsTrigger>
            <TabsTrigger value="finance">Financeiro</TabsTrigger>
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">{list}</TabsContent>
          <TabsContent value="finance">
            <Finance db={db} requests={visible} />
          </TabsContent>
          <TabsContent value="catalog">{catalog}</TabsContent>
        </Tabs>
      ) : (
        list
      )}
      {chat && (
        <RequestChat
          key={chat.id}
          db={db}
          user={user}
          request={chat}
          onClose={() => setChat(null)}
        />
      )}
    </section>
  );
}
