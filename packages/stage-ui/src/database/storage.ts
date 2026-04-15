import indexedDbDriver from 'unstorage/drivers/indexedb'
import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'

export const storage = createStorage({
  driver: memoryDriver(),
})

storage.mount('local', indexedDbDriver({ base: 'SAKURA-local' }))
storage.mount('outbox', indexedDbDriver({ base: 'SAKURA-sync-queue' }))
