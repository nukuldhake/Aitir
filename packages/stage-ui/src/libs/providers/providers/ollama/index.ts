import { createOllama } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

export const providerOllama = defineProvider({
  id: 'ollama',
  order: 2,
  name: 'Ollama',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.ollama.title'),
  description: 'Local Ollama server for fast model iteration.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.ollama.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:ollama',

  createProviderConfig: ({ t }) => z.object({
    baseUrl: z.string()
      .default('http://localhost:11434/v1/')
      .meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
      }),
    headers: z.record(z.string(), z.string())
      .optional()
      .meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.description'),
        section: 'advanced',
        type: 'key-values',
      }),
    numGpu: z.number()
      .int()
      .min(0)
      .optional()
      .meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.num-gpu.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.num-gpu.description'),
        section: 'advanced',
      }),
  }),
  createProvider(config: any) {
    const provider = createOllama('', config.baseUrl as string)

    // Inject num_gpu option if provided
    if (config.numGpu !== undefined) {
      const originalChat = provider.chat.bind(provider)
      provider.chat = (model: string) => {
        const chat = originalChat(model)
        const originalFetch = chat.fetch || globalThis.fetch
        chat.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.body && typeof init.body === 'string') {
            try {
              const body = JSON.parse(init.body)
              body.options = { ...body.options, num_gpu: config.numGpu }
              init.body = JSON.stringify(body)
            }
            catch (e) {
              console.warn('Failed to inject num_gpu into Ollama request:', e)
            }
          }
          return (originalFetch as any)(input, init)
        }
        return chat
      }
    }

    return provider
  },
  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'ollama:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })

          if (baseUrl) {
            try {
              const parsed = new URL(baseUrl)
              if (!parsed.host)
                errors.push({ error: new Error('Base URL is not absolute. Check your input.') })
            }
            catch {
              errors.push({ error: new Error('Base URL is invalid. It must be an absolute URL.') })
            }
          }

          return {
            errors,
            reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
    validateProvider: createOpenAICompatibleValidators({
      checks: ['connectivity', 'model_list', 'chat_completions'],
    })!.validateProvider,
  },
  business: ({ t }) => ({
    troubleshooting: {
      validators: {
        openaiCompatibleCheckConnectivity: {
          label: t('settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.label'),
          content: t('settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.content'),
        },
      },
    },
  }),
})
