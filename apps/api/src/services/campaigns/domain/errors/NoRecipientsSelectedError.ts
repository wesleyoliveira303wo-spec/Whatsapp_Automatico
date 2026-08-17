/** Criar uma campanha sem nenhum `contactId` selecionado não faz sentido — nada para calcular. */
export class NoRecipientsSelectedError extends Error {
  constructor() {
    super('Selecione pelo menos um contato para criar a campanha.');
    this.name = 'NoRecipientsSelectedError';
  }
}
