/**
 * MOVIDO para `shared/presentation/requireApiKey.ts` na Milestone 3, Bloco 5
 * (D9 do levantamento arquitetural — ver docstring do arquivo de destino
 * para a justificativa completa).
 *
 * Este arquivo continua existindo neste caminho SO por uma limitacao do
 * sandbox de desenvolvimento usado nesta sessao: tanto `rm` quanto `mv`
 * falharam com `EPERM` ao tentar remove-lo fisicamente (mesma classe de
 * limitacao do FUSE ja registrada em `DECISIONS.md`/`PROJECT_STATUS.md` para
 * `node_modules` aninhados - aqui reincidindo tambem em um arquivo de codigo
 * versionado, nao so em dependencias). Para nao duplicar logica (proibido
 * por `CLAUDE.md` parag. 17), este arquivo e apenas um re-export do modulo
 * real - nenhum comportamento vive aqui.
 *
 * ACAO PENDENTE para Wesley no ambiente local: apagar fisicamente este
 * arquivo (`git rm apps/api/src/services/whatsapp/presentation/requireApiKey.ts`)
 * - nenhum codigo de producao ou teste importa mais deste caminho.
 */
export * from '../../../shared/presentation/requireApiKey';
