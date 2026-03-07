import { CodePrReviewState } from '../database/entities/code-pr-review.entity';
import { CodeProviderGithub } from './code.provider.github';

describe('CodeProviderGithub', () => {
  const provider = new CodeProviderGithub();

  it('parses repo from webhook full_name', async () => {
    const result = await provider.handleWebhookEvent({
      event: 'pull_request',
      deliveryId: 'd1',
      body: {
        repository: {
          full_name: 'octo/repo',
        },
      },
    });

    expect(result.handled).toBe(true);
    expect(result.repos).toEqual([{ owner: 'octo', name: 'repo' }]);
  });

  it('parses repo from webhook owner+name fallback', async () => {
    const result = await provider.handleWebhookEvent({
      event: 'push',
      deliveryId: 'd2',
      body: {
        repository: {
          owner: { login: 'alice' },
          name: 'infra',
        },
      },
    });

    expect(result.repos).toEqual([{ owner: 'alice', name: 'infra' }]);
  });

  it('normalizes review states and falls back to COMMENTED', async () => {
    const cast = provider as unknown as {
      normalizeReviewState: (value: unknown) => CodePrReviewState;
    };

    expect(cast.normalizeReviewState('approved')).toBe(CodePrReviewState.APPROVED);
    expect(cast.normalizeReviewState('CHANGES_REQUESTED')).toBe(CodePrReviewState.CHANGES_REQUESTED);
    expect(cast.normalizeReviewState('nonsense')).toBe(CodePrReviewState.COMMENTED);
  });
});
