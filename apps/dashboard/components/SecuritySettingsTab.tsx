import { ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * Seção "Segurança" de Configurações — Reestruturação, Fase 3 (2026-08-27).
 *
 * Deliberadamente ENXUTA: mostra só as políticas que o backend de fato
 * impõe hoje, como INFORMAÇÃO verificável — nada aqui é editável porque
 * nenhuma dessas regras é configurável no produto (são fixas em código,
 * ver `permissions.ts` e `passwordPolicy.ts`).
 *
 * O que NÃO está aqui, de propósito: "sessões ativas / dispositivos"
 * (revogar login de outro aparelho). A tabela `RefreshToken` já guarda
 * `userAgent`, `ip` e `expiresAt` por login — o dado existe — mas não há
 * endpoint que liste ou revogue. Está registrado como P2 no
 * `CONFIGURACOES_REDESIGN_PLAN.md`; inventar a tela antes da API seria
 * prometer função inexistente.
 */
export default function SecuritySettingsTab(): JSX.Element {
  const policies = [
    {
      title: 'Hierarquia de cargos',
      description:
        'Ninguém gerencia alguém do mesmo cargo ou acima. Um administrador não cria nem promove outro administrador, e o dono da conta não pode ser suspenso — garantindo que sempre exista um dono ativo.',
    },
    {
      title: 'Senha mínima de 8 caracteres',
      description:
        'Vale para cadastro, troca de senha e senhas provisórias criadas pela equipe.',
    },
    {
      title: 'Troca obrigatória de senha provisória',
      description:
        'Quem recebe uma senha definida por um administrador precisa trocá-la antes de usar o Francis. A regra é imposta pelo servidor, não só pela tela.',
    },
    {
      title: 'Isolamento entre empresas',
      description:
        'Todo acesso é validado contra a empresa dona do dado. Um usuário nunca alcança conversas, contatos ou usuários de outro workspace.',
    },
    {
      title: 'Sessão expira e é renovada automaticamente',
      description:
        'O acesso usa um crachá de curta duração, renovado em segundo plano. Sair encerra a sessão em todos os pontos.',
    },
  ];

  return (
    <div>
      {/* Sem parágrafo de intro aqui: mesmo com texto diferente da
          descrição da seção (`SettingsLayout`), duas frases seguidas sobre
          "políticas fixas deste workspace" liam como a mesma mensagem
          duplicada reportada em WhatsApps/Atendimento (2026-08-27). Um
          texto só. */}
      <div className="flex flex-col gap-2.5">
        {policies.map((policy) => (
          <Card key={policy.title} className="flex items-start gap-3 p-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
              <ShieldCheck className="h-[16px] w-[16px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              {/* `h3` (não `span`): a página é h1 -> a seção é h2 -> cada política é h3. Mantém a navegação por headings coerente para leitor de tela. */}
              <h3 className="text-[13.5px] font-semibold text-foreground">{policy.title}</h3>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {policy.description}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
