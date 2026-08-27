import { motion } from 'framer-motion';
import SettingsSidebar, {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from '@/components/SettingsSidebar';
import WhatsAppsSettingsTab from '@/components/WhatsAppsSettingsTab';
import UserManagementPanel from '@/components/UserManagementPanel';
import AuditLogPanel from '@/components/AuditLogPanel';
import CompanySettingsTab from '@/components/CompanySettingsTab';
import AtendimentoSettingsTab from '@/components/AtendimentoSettingsTab';
import SecuritySettingsTab from '@/components/SecuritySettingsTab';
import { fadeIn } from '@/lib/motion';
import type { ManagedUserRole } from '@/lib/clientApi';

interface SettingsLayoutProps {
  section: SettingsSectionId;
  role: ManagedUserRole | null;
  basePath: string;
}

/** Título e subtítulo por seção — o `<h2>` some da barra e passa a titular o conteúdo. */
const SECTION_COPY: Record<SettingsSectionId, { title: string; description: string }> = {
  empresa: {
    title: 'Dados da empresa',
    description: 'Como sua empresa aparece para a equipe dentro do Francis.',
  },
  atendimento: {
    title: 'Atendimento',
    description:
      'O horário de atendimento é definido por WhatsApp — cada número tem a própria agenda e mensagem de ausência.',
  },
  whatsapps: {
    title: 'WhatsApps',
    description: 'Conecte e administre os números que o Francis atende.',
  },
  equipe: {
    title: 'Equipe',
    description: 'Quem tem acesso a este workspace e o que cada pessoa pode fazer.',
  },
  seguranca: {
    title: 'Segurança',
    description: 'Políticas de acesso aplicadas a este workspace.',
  },
  auditoria: {
    title: 'Auditoria',
    description: 'Histórico das ações administrativas feitas aqui.',
  },
};

/**
 * Moldura de Configurações — Reestruturação, Fase 3 (2026-08-27, ver
 * `CONFIGURACOES_REDESIGN_PLAN.md`). Substitui `SettingsTabs` (barra de abas
 * horizontal), que a auditoria reprovou por dois motivos: não escalava de 4
 * para 6+ seções, e MUDAVA DE FORMA conforme o papel de quem entrava.
 *
 * Sidebar à esquerda com grupos rotulados (EMPRESA / CANAIS / PESSOAS /
 * REGISTROS) + conteúdo à direita. Em telas estreitas a sidebar vira uma
 * lista acima do conteúdo (`flex-col` → `sm:flex-row`), sem menu escondido.
 *
 * O gate de papel NÃO vive aqui: a página resolve a seção no servidor
 * (`resolveSection`, em `SettingsSidebar`) antes de renderizar, então uma
 * URL proibida nunca chega a montar este componente. Aqui só se decide qual
 * painel exibir.
 */
export default function SettingsLayout({
  section,
  role,
  basePath,
}: SettingsLayoutProps): JSX.Element {
  const copy = SECTION_COPY[section];
  const canManageCompany = role === 'owner';

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <SettingsSidebar active={section} role={role} basePath={basePath} />

      <div className="min-w-0 flex-1">
        <div className="mb-5">
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
            {copy.title}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{copy.description}</p>
        </div>

        {/*
          `key={section}` refaz o cross-fade a cada troca de seção — como
          cada seção é uma NAVEGAÇÃO real agora (URL própria), o React
          remonta naturalmente; a animação só suaviza a substituição.
        */}
        <motion.div key={section} variants={fadeIn} initial="hidden" animate="visible">
          {section === 'empresa' && <CompanySettingsTab canManage={canManageCompany} />}
          {section === 'atendimento' && <AtendimentoSettingsTab />}
          {section === 'whatsapps' && <WhatsAppsSettingsTab />}
          {section === 'equipe' && <UserManagementPanel />}
          {section === 'seguranca' && <SecuritySettingsTab />}
          {section === 'auditoria' && <AuditLogPanel />}
        </motion.div>
      </div>
    </div>
  );
}

/** Reexport para as páginas montarem os props sem importar de dois lugares. */
export { SETTINGS_SECTIONS };
export type { SettingsSectionId };
