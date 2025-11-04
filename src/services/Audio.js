class AudioCacheService {
  constructor() {
    this.cache = new Map()
    this.preloadQueue = []
    this.maxCacheSize = 50
    this.maxPreloadSize = 5
    this.cacheSize = 0
    this.isPreloading = false
    this.preloadTimeout = null
    this.preloadStartTime = 0
    this.preloadCount = 0
  }

  getAudioUrl(track) {
    if (!track || !track.url) return ''
    
    const customProxyUrl = localStorage.getItem('ui.customProxyUrl') || ''
    if (customProxyUrl) {
      return `${customProxyUrl}?url=${encodeURIComponent(track.url)}`
    }
    
    if (track.url.includes('github.com') || track.url.includes('raw.githubusercontent.com')) {
      return `/api/audio?url=${encodeURIComponent(track.url)}`
    }
    
    try {
      const url = new URL(track.url, window.location.origin)
      const currentOrigin = window.location.origin
      
      if (url.origin !== currentOrigin && url.protocol.startsWith('http')) {
        const pathname = url.pathname
        if (pathname) {
          const key = decodeURIComponent(pathname.replace(/^\/+/, ''))
          if (key) {
            return `/api/r2?key=${encodeURIComponent(key)}`
          }
        }
      }
    } catch {
    }
    
    return track.url
  }

  async preloadAudio(track, priority = 'normal') {
    if (!track || !track.url) return null
    
    // const audioUrl = this.getAudioUrl(track) // 保留以备将来使用
    const cacheKey = this.getCacheKey(track)
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    this.addToPreloadQueue(track, priority)
    
    this.startPreloading()
    
    return null
  }

  getCachedAudio(track) {
    if (!track || !track.url) return null
    
    const cacheKey = this.getCacheKey(track)
    return this.cache.get(cacheKey) || null
  }

  async cacheAudio(track) {
    if (!track || !track.url) return null
    
    const audioUrl = this.getAudioUrl(track)
    const cacheKey = this.getCacheKey(track)
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    try {
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'metadata'
      audio.src = audioUrl
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('音频加载超时'))
        }, 10000)
        
        const cleanup = () => {
          clearTimeout(timeout)
          audio.removeEventListener('canplay', onCanPlay)
          audio.removeEventListener('error', onError)
        }
        
        const onCanPlay = () => {
          cleanup()
          resolve()
        }
        
        const onError = (e) => {
          cleanup()
          reject(e)
        }
        
        audio.addEventListener('canplay', onCanPlay)
        audio.addEventListener('error', onError)
        audio.load()
      })
      
      this.setCache(cacheKey, audio)
      
      return audio
    } catch (error) {
      console.warn('音频缓存失败:', error)
      return null
    }
  }

  async preloadNext(tracks, currentIndex) {
    if (!tracks || !Array.isArray(tracks)) return
    
    const nextIndex = (currentIndex + 1) % tracks.length
    const nextTrack = tracks[nextIndex]
    
    if (nextTrack) {
      await this.preloadAudio(nextTrack, 'high')
    }
  }

  async preloadPrev(tracks, currentIndex) {
    if (!tracks || !Array.isArray(tracks)) return
    
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length
    const prevTrack = tracks[prevIndex]
    
    if (prevTrack) {
      await this.preloadAudio(prevTrack, 'high')
    }
  }

  async preloadBatch(tracks, startIndex, count = 3) {
    if (!tracks || !Array.isArray(tracks)) return
    
    const preloadPromises = []
    
    for (let i = 0; i < count; i++) {
      const index = (startIndex + i) % tracks.length
      const track = tracks[index]
      
      if (track) {
        preloadPromises.push(this.preloadAudio(track, 'normal'))
      }
    }
    
    await Promise.allSettled(preloadPromises)
  }

  clearCache() {
    this.cache.forEach(audio => {
      if (audio && audio.src) {
        audio.src = ''
        audio.load()
      }
    })
    this.cache.clear()
    this.cacheSize = 0
    
    this.preloadQueue = []
    
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.includes('audio-cache')) {
            caches.delete(cacheName)
          }
        })
      })
    }
  }

  getCacheStats() {
    return {
      cacheSize: this.cacheSize,
      maxCacheSize: this.maxCacheSize,
      preloadQueueLength: this.preloadQueue.length,
      isPreloading: this.isPreloading,
      preloadCount: this.preloadCount,
      preloadStartTime: this.preloadStartTime
    }
  }

  setMaxCacheSize(size) {
    this.maxCacheSize = Math.max(1, size)
    this.cleanupCache()
  }

  getCacheKey(track) {
    return `${track.url}_${track.title || ''}`
  }

  addToPreloadQueue(track, priority) {
    const existing = this.preloadQueue.find(item => item.track.url === track.url)
    if (existing) return
    
    this.preloadQueue.push({
      track,
      priority,
      timestamp: Date.now()
    })
    
    this.preloadQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }

  async startPreloading() {
    if (this.isPreloading || this.preloadQueue.length === 0) return
    
    this.isPreloading = true
    this.preloadStartTime = Date.now()
    this.preloadCount = 0
    
    try {
      while (this.preloadQueue.length > 0 && this.cacheSize < this.maxCacheSize) {
        const { track } = this.preloadQueue.shift()
        this.preloadCount++
        await this.cacheAudio(track)
      }
    } catch (error) {
      console.warn('预加载失败:', error)
    } finally {

      const preloadDuration = Date.now() - this.preloadStartTime
      const minDisplayTime = 3000
      const remainingTime = Math.max(minDisplayTime, minDisplayTime - preloadDuration)
      
      setTimeout(() => {
        this.isPreloading = false
        this.preloadCount = 0
      }, remainingTime)
    }
  }

  setCache(key, audio) {
    if (this.cacheSize >= this.maxCacheSize) {
      this.cleanupCache()
    }
    
    this.cache.set(key, audio)
    this.cacheSize++
  }

  cleanupCache() {
    if (this.cacheSize <= this.maxCacheSize) return
    
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => {
      const aTime = a[1].lastUsed || 0
      const bTime = b[1].lastUsed || 0
      return aTime - bTime
    })
    
    const toDelete = entries.slice(0, this.cacheSize - this.maxCacheSize)
    toDelete.forEach(([key, audio]) => {
      if (audio && audio.src) {
        audio.src = ''
        audio.load()
      }
      this.cache.delete(key)
      this.cacheSize--
    })
  }
}

const audioCacheService = new AudioCacheService()

export default audioCacheService
