import { ChangeConversationStatusUseCase } from './ChangeConversationStatusUseCase';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { Conversation } from '../../domain/entities/Conversation';
import { ConversationStatus } from '../../domain/enums/ConversationStatus';
import { InvalidConversationStatusError } from '../errors/InvalidConversationStatusError';
import { ConversationNotFoundError } from '../errors/ConversationNotFoundError';

/**
 * Helper to create a Conversation instance with defaults.
 */
function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  const base = {
    id: 'conv-1',
    tenantId: 'tenant-1',
    contactId: 'contact-1',
    status: ConversationStatus.NEW,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const props = { ...base, ...overrides } as never;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore – constructor expects ConversationProps
  return new Conversation(props);
}

describe('ChangeConversationStatusUseCase', () => {
  const mockRepo: jest.Mocked<ConversationRepository> = {
    findById: jest.fn(),
    findByContactId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const useCase = new ChangeConversationStatusUseCase(mockRepo);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should change status when valid', async () => {
    const conv = createConversation({ status: ConversationStatus.NEW });
    mockRepo.findById.mockResolvedValueOnce(conv);
    const input = { id: 'conv-1', tenantId: 'tenant-1', status: ConversationStatus.ACTIVE };

    const output = await useCase.execute(input);

    expect(output).toEqual({ id: 'conv-1', status: ConversationStatus.ACTIVE });
    expect(conv.status).toBe(ConversationStatus.ACTIVE);
    expect(mockRepo.save).toHaveBeenCalledWith(conv);
  });

  it('should throw InvalidConversationStatusError for invalid enum value', async () => {
    const input = { id: 'conv-1', tenantId: 'tenant-1', status: 'invalid_status' };
    await expect(useCase.execute(input as never)).rejects.toThrow(InvalidConversationStatusError);
    expect(mockRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw ConversationNotFoundError when conversation does not exist', async () => {
    mockRepo.findById.mockResolvedValueOnce(null);
    const input = { id: 'missing', tenantId: 'tenant-1', status: ConversationStatus.ACTIVE };
    await expect(useCase.execute(input)).rejects.toThrow(ConversationNotFoundError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should throw ConversationNotFoundError when tenantId mismatches', async () => {
    const conv = createConversation({ tenantId: 'different-tenant' });
    mockRepo.findById.mockResolvedValueOnce(conv);
    const input = { id: 'conv-1', tenantId: 'tenant-1', status: ConversationStatus.ACTIVE };
    await expect(useCase.execute(input)).rejects.toThrow(ConversationNotFoundError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should wrap domain rule errors into InvalidConversationStatusError', async () => {
    // Conversation entity prevents transition from CLOSED to non‑CLOSED
    const conv = createConversation({ status: ConversationStatus.CLOSED });
    mockRepo.findById.mockResolvedValueOnce(conv);
    const input = { id: 'conv-1', tenantId: 'tenant-1', status: ConversationStatus.ACTIVE };
    await expect(useCase.execute(input)).rejects.toThrow(InvalidConversationStatusError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
