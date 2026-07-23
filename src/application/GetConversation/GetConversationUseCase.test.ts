import { GetConversationUseCase } from './GetConversationUseCase';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { Conversation } from '../../domain/entities/Conversation';
import { ConversationNotFoundError } from '../errors/ConversationNotFoundError';
import { ConversationStatus } from '../../domain/enums/ConversationStatus';

// Helper to create a dummy Conversation instance
function createDummyConversation(overrides: Partial<Conversation> = {}): Conversation {
  const base = {
    id: 'conv-123',
    tenantId: 'tenant-1',
    contactId: 'contact-1',
    status: ConversationStatus.NEW,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const props = { ...base, ...overrides } as never;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore – the constructor expects ConversationProps, which we emulate
  return new Conversation(props);
}

describe('GetConversationUseCase', () => {
  const mockRepo: jest.Mocked<ConversationRepository> = {
    findById: jest.fn(),
    findByContactId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const useCase = new GetConversationUseCase(mockRepo);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the conversation when found and tenant matches', async () => {
    const dummy = createDummyConversation({ tenantId: 'tenant-1' });
    mockRepo.findById.mockResolvedValueOnce(dummy);

    const input = { id: 'conv-123', tenantId: 'tenant-1' };
    const result = await useCase.execute(input);

    expect(result.conversation).toBe(dummy);
    expect(mockRepo.findById).toHaveBeenCalledWith('conv-123');
  });

  it('should throw ConversationNotFoundError when conversation does not exist', async () => {
    mockRepo.findById.mockResolvedValueOnce(null);
    const input = { id: 'missing', tenantId: 'tenant-1' };

    await expect(useCase.execute(input)).rejects.toThrow(ConversationNotFoundError);
    expect(mockRepo.findById).toHaveBeenCalledWith('missing');
  });

  it('should throw ConversationNotFoundError when tenantId does not match', async () => {
    const dummy = createDummyConversation({ tenantId: 'different-tenant' });
    mockRepo.findById.mockResolvedValueOnce(dummy);
    const input = { id: 'conv-123', tenantId: 'tenant-1' };

    await expect(useCase.execute(input)).rejects.toThrow(ConversationNotFoundError);
    expect(mockRepo.findById).toHaveBeenCalledWith('conv-123');
  });
});
