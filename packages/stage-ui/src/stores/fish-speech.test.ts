import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { useProvidersStore } from '../stores/providers'

// Mock fetch for testing listVoices
globalThis.fetch = vi.fn()

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('fish-speech provider', () => {
  setActivePinia(createPinia())
  const store = useProvidersStore()
  const fishSpeech = store.providerMetadata['fish-speech-local']

  it('should have a valid metadata', () => {
    expect(fishSpeech.id).toBe('fish-speech-local')
    expect(fishSpeech.category).toBe('speech')
  })

  it('should return fallback voices when fetch fails', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'))
    
    const voices = await fishSpeech.capabilities.listVoices!({ baseUrl: 'http://127.0.0.1:8080/v1/' })
    expect(voices.length).toBeGreaterThan(0)
    expect(voices[0].id).toBe('egirl_energetic_01')
  })

  it('should return discovered voices when fetch succeeds', async () => {
    const mockVoices = [
      { id: 'custom-voice-1', name: 'Custom Voice 1' }
    ];
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockVoices,
    })

    const voices = await fishSpeech.capabilities.listVoices!({ baseUrl: 'http://127.0.0.1:8080/v1/' })
    expect(voices.length).toBe(1)
    expect(voices[0].id).toBe('custom-voice-1')
  })

  it('should validate base URL correctly', async () => {
    const validResult = await fishSpeech.validators.validateProviderConfig({ baseUrl: 'http://127.0.0.1:8080/v1/' })
    expect(validResult.valid).toBe(true)

    const invalidResult = await fishSpeech.validators.validateProviderConfig({ baseUrl: 'not-a-url' })
    expect(invalidResult.valid).toBe(false)
    expect(invalidResult.reason).toContain('Base URL is not absolute')
  })
})
