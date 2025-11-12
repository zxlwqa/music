import React, { useEffect, Suspense, useMemo, useState, useRef } from 'react'
const Player = React.lazy(() => import('./components/Player.jsx'))
const SearchBar = React.lazy(() => import('./components/SearchBar.jsx'))
const VPlaylist = React.lazy(() => import('./components/VPlaylist.jsx'))
const Password = React.lazy(() => import('./components/Password.jsx'))
const Settings = React.lazy(() => import('./components/Settings.jsx'))
// const Progress = React.lazy(() => import('./components/Progress.jsx')) // 保留以备将来使用
const Dialog = React.lazy(() => import('./components/Dialog.jsx'))
import ErrorBoundary from './components/Bondary'
import { useErrorNotification } from './components/Notifica'
import { useError } from './hooks/error'
import { useAppState } from './hooks/state'
import { useKey } from './hooks/key'
import { useTheme } from './hooks/theme'
import { loadManifest, processTracks, preloadAssets } from './utils/manifest'
import { persistRemoveByUrl, clearAudioCache } from './utils/storage'
import * as api from './services/api'
import { executeDelete } from './services/delete'
import { executeUpload } from './services/upload'

export default function App() {
  const { handleError } = useError()
  const { addNotification, ErrorNotificationContainer } = useErrorNotification()
  const appState = useAppState()
  useTheme()
  
  const {
    tracks, setTracks,
    query, setQuery,
    currentIndex, setCurrentIndex,
    loading, setLoading,
    error, setError,
    forcePlayKey, setForcePlayKey,
    passwordOpen, setPasswordOpen,
    settingsOpen, setSettingsOpen,
    progressOpen, setProgressOpen,
    pendingDeleteUrl, setPendingDeleteUrl,
    pendingDeleteName, setPendingDeleteName,
    // eslint-disable-next-line no-unused-vars
    passwordErrorCount: _passwordErrorCount, setPasswordErrorCount,
    progressTitle, setProgressTitle,
    progressMessage, setProgressMessage,
    progressValue, setProgressValue
  } = appState

  // 收藏功能状态
  const [favoriteUrls, setFavoriteUrls] = useState(new Set())
  const [showFavorites, setShowFavorites] = useState(false)
  // eslint-disable-next-line no-unused-vars
  const [_gistId, setGistId] = useState(null)
  const isSavingGistRef = useRef(false)

  // 从localStorage和Gist加载收藏列表
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        // 首先尝试从localStorage加载（快速恢复）
        const savedFavorites = localStorage.getItem('favoriteUrls')
        if (savedFavorites) {
          const localFavorites = JSON.parse(savedFavorites)
          setFavoriteUrls(new Set(localFavorites))
        }
        
        // 然后从Gist加载（持久化数据）
        try {
          const gistFavorites = await api.loadFavoritesFromGist()
          if (Array.isArray(gistFavorites) && gistFavorites.length > 0) {
            setFavoriteUrls(new Set(gistFavorites))
            // 同步到localStorage
            localStorage.setItem('favoriteUrls', JSON.stringify(gistFavorites))
          }
        } catch (gistError) {
          console.warn('从Gist加载收藏列表失败，使用本地数据:', gistError)
          // 如果Gist加载失败，继续使用localStorage的数据
        }
      } catch (e) {
        console.error('加载收藏列表失败:', e)
      }
    }
    
    loadFavorites()
  }, [])

  // 保存收藏列表到localStorage和Gist
  useEffect(() => {
    const favoritesArray = [...favoriteUrls]
    
    // 先保存到localStorage（快速）
    try {
      localStorage.setItem('favoriteUrls', JSON.stringify(favoritesArray))
    } catch (e) {
      console.error('保存收藏列表到localStorage失败:', e)
    }
    
    // 然后保存到Gist（持久化）
    const saveFavorites = async () => {
      if (isSavingGistRef.current) return
      
      isSavingGistRef.current = true
      try {
        const result = await api.saveFavoritesToGist(favoritesArray)
        if (result.gistId) {
          setGistId(result.gistId)
        }
      } catch (gistError) {
        console.warn('保存收藏列表到Gist失败:', gistError)
        // 不阻止用户操作，只是记录警告
      } finally {
        isSavingGistRef.current = false
      }
    }
    
    // 使用防抖，避免频繁保存
    const timeoutId = setTimeout(() => {
      saveFavorites()
    }, 1000)
    
    return () => clearTimeout(timeoutId)
  }, [favoriteUrls])

  // 切换收藏状态
  const handleToggleFavorite = (url, isFavorite) => {
    setFavoriteUrls(prev => {
      const newSet = new Set(prev)
      if (isFavorite) {
        newSet.add(url)
      } else {
        newSet.delete(url)
      }
      return newSet
    })
    // 收藏列表变化时会自动保存到 Gist（通过 useEffect）
  }

  // 切换歌单显示状态
  const toggleFavorites = () => {
    setShowFavorites(prev => !prev)
    setQuery('')
  }

  // 全局函数，供设置菜单调用
  useEffect(() => {
    window.toggleFavorites = toggleFavorites
    window.switchToR2 = async () => {
      try {
        setProgressOpen(true)
        setProgressTitle('加载中')
        setProgressMessage('正在从 R2存储桶获取歌曲列表...')
        setProgressValue(20)
        const data = await api.importFromR2()
        const items = data.data
        const sanitized = []
        const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
        for (let i = 0; i < items.length; i++) {
          const it = items[i] || {}
          if (!it.url) continue
          let title = it.title || it.name || ''
          if (!title && it.name) {
            const base = String(it.name).replace(/\.[^.]+$/, '')
            title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
          }
          if (!title) {
            title = `Track ${i + 1}`
          }
          const cover = `/covers/${localPreferred[i % localPreferred.length]}`
          sanitized.push({ title, url: it.url, cover })
        }
        if (!sanitized.length) throw new Error('R2存储桶中未发现音频文件')
        localStorage.setItem('overrideTracks', JSON.stringify(sanitized))
        setTracks(sanitized)
        setQuery('')
        setProgressTitle('完成')
        setProgressMessage(`已从 R2加载 ${sanitized.length} 首歌曲`)
        setProgressValue(100)
        setTimeout(() => { setProgressOpen(false); setSettingsOpen(false) }, 1200)
      } catch (e) {
        console.error('R2导入错误:', e)
        setProgressTitle('失败')
        setProgressMessage(e?.message || e?.toString() || 'R2导入失败')
        setTimeout(() => { setProgressOpen(false) }, 2000)
      }
    }
    return () => {
      delete window.toggleFavorites
      delete window.switchToR2
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setter 函数是稳定的，不需要添加到依赖数组
  }, [])

  useKey(passwordOpen, settingsOpen, progressOpen, setPasswordOpen, setSettingsOpen, setProgressOpen, setPendingDeleteUrl, setPendingDeleteName)

  const loadManifestData = async () => {
    try {
      const data = await loadManifest()
      const finalList = processTracks(data)
      setTracks(finalList)
      setLoading(false)
      await preloadAssets(finalList)
    } catch (e) {
      console.error('清单加载错误:', e)
      const errorMessage = e?.message || e?.toString() || '清单加载错误'
      setError(errorMessage)
      setLoading(false)
      addNotification({ message: errorMessage }, { autoClose: true, duration: 5000 })
    }
  }
  
  useEffect(() => { 
    loadManifestData() 
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在组件挂载时执行一次
  }, [])





  const handleDelete = async (passwordValue) => {
    const deletedUrl = pendingDeleteUrl
    await executeDelete(pendingDeleteUrl, passwordValue, tracks, setTracks, persistRemoveByUrl, clearAudioCache, setProgressOpen, setProgressTitle, setProgressMessage, setProgressValue, handleError, loadManifestData)
    
    // 从收藏列表中移除已删除的歌曲
    if (deletedUrl && favoriteUrls.has(deletedUrl)) {
      setFavoriteUrls(prev => {
        const newSet = new Set(prev)
        newSet.delete(deletedUrl)
        return newSet
      })
    }
    
    setPendingDeleteUrl('')
    setPendingDeleteName('')
  }

  const normalized = (s) => (s || '').toLowerCase()
  const filteredTracks = useMemo(() => {
    let filtered = tracks
    
    // 如果显示收藏歌单，只显示收藏的歌曲
    if (showFavorites) {
      filtered = tracks.filter(t => favoriteUrls.has(t.url))
    }
    
    // 应用搜索过滤
    if (query.trim()) {
      filtered = filtered.filter(t => {
        const title = t.title || ''
        return normalized(title).includes(normalized(query))
      })
    }
    
    return filtered
  }, [tracks, query, showFavorites, favoriteUrls])

  useEffect(() => {
    if (currentIndex >= filteredTracks.length) {
      setCurrentIndex(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setCurrentIndex 是稳定的 setter 函数，不需要添加
  }, [query, filteredTracks.length])

  if (loading) return (
    <div className="container">
      <div className="player" style={{ height: '200px', minHeight: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          加载中...
        </div>
      </div>
      <div className="search-bar" style={{ height: '44px', minHeight: '44px' }}>
        <input className="search-input" placeholder="搜索歌曲或歌手" disabled id="search-loading" name="search-loading" aria-label="搜索歌曲或歌手（加载中）" />
      </div>
      <div className="virtual-playlist">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          正在加载播放列表...
        </div>
      </div>
      <footer style={{ height: '40px', minHeight: '40px' }}>
        <div style={{ textAlign: 'center' }}></div>
      </footer>
    </div>
  )
  if (error) return <div className="container error">{error}</div>
  if (!tracks.length) return <div className="container">未发现音乐文件，请将音频放入 public/music</div>

  return (
    <ErrorBoundary 
      name="App"
      onError={(error, errorInfo) => {
        console.error('App Error Boundary caught an error:', error, errorInfo)
        addNotification(error, { autoClose: false })
      }}
    >
      <div className="container">
      <Suspense fallback={
        <div className="player" style={{ height: '200px', minHeight: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            加载播放器...
          </div>
        </div>
      }>
        <Player tracks={filteredTracks} currentIndex={currentIndex} onChangeIndex={setCurrentIndex} forcePlayKey={forcePlayKey} onOpenSettings={() => setSettingsOpen(true)} />
      </Suspense>
      <Suspense fallback={
        <div className="search-bar" style={{ height: '44px', minHeight: '44px' }}>
          <input className="search-input" placeholder="搜索歌曲或歌手" disabled id="search-fallback" name="search-fallback" aria-label="搜索歌曲或歌手（加载中）" />
        </div>
      }>
        <SearchBar value={query} onChange={setQuery} />
      </Suspense>
      <Suspense fallback={
        <div className="virtual-playlist">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            加载播放列表...
          </div>
        </div>
      }>
      <VPlaylist
        tracks={filteredTracks}
        currentIndex={currentIndex}
        onSelect={(i) => { setCurrentIndex(i); setForcePlayKey(Date.now()) }}
        onDelete={(url) => {
          setPendingDeleteUrl(url)
          const track = tracks.find(t => t.url === url) || filteredTracks.find(t => t.url === url)
          const title = track?.title || ''
          const match = title.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
          const display = match ? `${match[1].trim()} - ${match[2].trim()}` : title
          setPendingDeleteName(display)
          
          setPasswordOpen(true)
        }}
        onToggleFavorite={handleToggleFavorite}
        favoriteUrls={favoriteUrls}
        itemHeight={45}
        containerHeight={window.innerWidth <= 480 ? 300 : 400}
        overscan={5}
      />
      </Suspense>
      <Suspense fallback={<div style={{ display: 'none' }}></div>}>
      <Password
        open={passwordOpen}
        title="删除歌曲"
        message={pendingDeleteName ? `确认删除：${pendingDeleteName}？` : '确认删除该歌曲吗？'}
        onCancel={() => { 
          setPasswordOpen(false)
          setPendingDeleteUrl('')
          setPendingDeleteName('')
          setPasswordErrorCount(0)
        }}
            onConfirm={(pwd) => {
              setPasswordOpen(false)
              handleDelete(pwd)
            }}
        onPasswordError={() => {
          setPasswordErrorCount(prev => prev + 1)
        }}
      />
      </Suspense>
      <Suspense fallback={<div style={{ display: 'none' }}></div>}>
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
            onAddSong={async ({ songUrl, songTitle, fileName, mvUrl, base64, contentType, suppressClose, uploadTarget = 'github' }) => {
              await executeUpload(songUrl, songTitle, fileName, mvUrl, base64, contentType, suppressClose, tracks, setTracks, query, setQuery, setProgressOpen, setProgressTitle, setProgressMessage, setProgressValue, setSettingsOpen, handleError, uploadTarget)
            }}
        onImportRepo={async ({ gitRepo, gitToken, gitBranch, gitPath }) => {
          if (!gitRepo || !gitToken) return
          try {
            setProgressOpen(true)
            setProgressTitle('导入中')
            setProgressMessage('正在读取仓库文件列表...')
            setProgressValue(10)
            const items = await api.importFromRepo(gitRepo, gitToken, gitBranch, gitPath)
            const allFiles = Array.isArray(items) ? items.filter(it => it && it.type === 'file') : []
            const audioExts = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.webm']
            const isExt = (name, exts) => exts.some(ext => name.toLowerCase().endsWith(ext))
            const audioFiles = allFiles.filter(it => isExt(it.name || '', audioExts))
            if (!audioFiles.length) {
              setProgressTitle('完成')
              setProgressMessage('未在该路径下发现音频文件')
              setProgressValue(100)
              setTimeout(() => setProgressOpen(false), 1200)
              return
            }
            setProgressMessage(`发现 ${audioFiles.length} 个音频文件，正在导入...`)
            setProgressValue(40)
            const added = []
            for (let i = 0; i < audioFiles.length; i++) {
              const it = audioFiles[i]
              const name = it.name || ''
              const base = name.replace(/\.[^.]+$/, '')
              const title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
              const rawUrl = it.download_url || it.url || ''
              const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
              const cover = `/covers/${localPreferred[i % localPreferred.length]}`
              added.push({ title, url: rawUrl, cover })
              setProgressValue(40 + Math.floor(((i + 1) / audioFiles.length) * 50))
            }
            localStorage.setItem('overrideTracks', JSON.stringify(added))
            setTracks(added)
            setQuery('')
            setProgressTitle('完成')
            setProgressMessage('导入完成')
            setProgressValue(100)
          } catch (e) {
            console.error('仓库导入错误:', e)
            setProgressTitle('失败')
            setProgressMessage(e?.message || e?.toString() || '导入失败')
          } finally {
            setTimeout(() => { setProgressOpen(false); setSettingsOpen(false) }, 1200)
          }
        }}
        onImportApi={async ({ apiUrl }) => {
          if (!apiUrl) return
          try {
            setProgressOpen(true)
            setProgressTitle('导入中')
            setProgressMessage('正在拉取 API 歌单...')
            setProgressValue(20)
            const data = await api.importFromApi(apiUrl)
            const items = data.data
            const sanitized = []
            const localPreferred = ['a.webp','b.webp','c.webp','d.webp','e.webp','f.webp','g.webp','h.webp','i.webp','j.webp','k.webp','l.webp','m.webp','n.webp','o.webp','p.webp','q.webp','r.webp','s.webp','t.webp','u.webp','v.webp','w.webp','x.webp','y.webp','z.webp']
            for (let i = 0; i < items.length; i++) {
              const it = items[i] || {}
              if (!it.url) continue
              let title = it.title || it.name || ''
              if (!title && it.filename) {
                const base = String(it.filename).replace(/\.[^.]+$/, '')
                title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
              }
              if (!title) {
                title = `Track ${i + 1}`
              }
              const cover = `/covers/${localPreferred[i % localPreferred.length]}`
              sanitized.push({ title, url: it.url, cover })
            }
            if (!sanitized.length) throw new Error('API 未返回可用的歌曲项')
            localStorage.setItem('overrideTracks', JSON.stringify(sanitized))
            setTracks(sanitized)
            setQuery('')
            setProgressTitle('完成')
            setProgressMessage('API 歌单导入完成')
            setProgressValue(100)
          } catch (e) {
            console.error('API导入错误:', e)
            setProgressTitle('失败')
            setProgressMessage(e?.message || e?.toString() || '导入失败')
          } finally {
            setTimeout(() => { setProgressOpen(false); setSettingsOpen(false) }, 1200)
          }
        }}
        onResetPlaylist={async () => {
          try {
            localStorage.removeItem('overrideTracks')
            localStorage.removeItem('extraTracks')
            localStorage.removeItem('deletedUrls')
            localStorage.removeItem('deletedTitles')
          } catch {}
          setQuery('')
          await loadManifestData()
          setCurrentIndex(0)
          setSettingsOpen(false)
        }}
        onWebDavUpload={async () => {
          try {
            setProgressOpen(true)
            setProgressTitle('上传中')
            setProgressMessage('正在通过 WebDAV 分批上传...')
            setProgressValue(10)
            let cursor = 0
            let total = 0
            let uploaded = 0
          let skipped = 0
            const step = 3
            while (true) {
              const data = await api.webdavUpload(cursor, step)
              total = data.total || total
              uploaded += data.uploaded || 0
            skipped += data.skipped || 0
              cursor = data.nextCursor
              const prog = total ? Math.min(95, Math.floor((uploaded / total) * 90) + 5) : 50
            setProgressValue(prog)
            setProgressMessage(`已上传 ${uploaded}/${total || '?'}，已跳过 ${skipped} ...`)
              if (cursor == null) break
            }
            setProgressValue(100)
            setProgressTitle('完成')
          setProgressMessage(`已上传 ${uploaded}/${total}，已跳过 ${skipped}`)
          } catch (e) {
            console.error('WebDAV上传错误:', e)
            setProgressTitle('失败')
            setProgressMessage(e?.message || e?.toString() || 'WebDAV 上传失败')
          } finally {
            setTimeout(() => { setProgressOpen(false) }, 1200)
          }
        }}
        onWebDavRestore={async () => {
          try {
            setProgressOpen(true)
            setProgressTitle('恢复中')
            setProgressMessage('正在从 WebDAV 分批恢复到仓库...')
            setProgressValue(10)
            let cursor = 0
            let total = 0
            let restored = 0
          let skipped = 0
            const step = 3
            while (true) {
              const data = await api.webdavRestore(cursor, step)
              total = data.total || total
              restored += data.restored || 0
            skipped += data.skipped || 0
              cursor = data.nextCursor
              const prog = total ? Math.min(95, Math.floor((restored / total) * 90) + 5) : 50
            setProgressValue(prog)
            setProgressMessage(`已恢复 ${restored}/${total || '?'}，已跳过 ${skipped} ...`)
              if (cursor == null) break
            }
            setProgressValue(100)
            setProgressTitle('完成')
          setProgressMessage(`已恢复 ${restored}/${total}，已跳过 ${skipped}`)
            await loadManifestData()
          } catch (e) {
            console.error('WebDAV恢复错误:', e)
            setProgressTitle('失败')
            setProgressMessage(e?.message || e?.toString() || 'WebDAV 恢复失败')
          } finally {
            setTimeout(() => { setProgressOpen(false) }, 1200)
          }
        }}
      />
      </Suspense>
      {progressOpen && (
        <Suspense fallback={<div style={{ display: 'none' }}></div>}>
          <Dialog
            open={progressOpen}
            title={progressTitle}
            message={progressMessage}
            value={progressValue}
            onClose={() => setProgressOpen(false)}
            type="upload"
            showCancel={true}
            showAnimation={true}
          />
        </Suspense>
      )}
      <footer style={{ 
        marginBottom: (typeof window !== 'undefined' && window.innerWidth <= 480) ? 0 : '0.25rem', 
        marginTop: (typeof window !== 'undefined' && window.innerWidth <= 480) ? 0 : undefined, 
        paddingBottom: (typeof window !== 'undefined' && window.innerWidth <= 480) ? 0 : undefined,
        minHeight: '40px',
        contain: 'layout style'
      }}>
        <div style={{ textAlign: 'center' }}></div>
      </footer>
      </div>
      
      <ErrorNotificationContainer />
    </ErrorBoundary>
  )
}

