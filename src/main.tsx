import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'

import Home from './screens/Home'
import NewOrder from './screens/NewOrder'
import Confirm from './screens/Confirm'
import Working from './screens/Working'
import Result from './screens/Result'
import Orders from './screens/Orders'
import Track from './screens/Track'
import Carrier from './screens/Carrier'
import Day from './screens/Day'
import Role from './screens/Role'
import Setup from './screens/Setup'
import Demo from './screens/Demo'
import { isConfigured } from './lib/supabase'
import { useRole } from './ui/Shell'

// Leaflet весит больше, чем весь остальной клиент, а нужен на одном экране.
// Отдельным чанком: на медленном Wi-Fi демо стартует без него.
const Address = lazy(() => import('./screens/Address'))

/** Первый заход — спрашиваем роль. Дальше сразу нужная главная. */
function RoleGate() {
  const role = useRole()
  if (!role) return <Role />
  if (role === 'carrier') return <Navigate to="/carrier" replace />
  return <Home />
}

const router = createBrowserRouter(
  isConfigured
    ? [
        { path: '/', element: <RoleGate /> },
        { path: '/role', element: <Role /> },
        { path: '/new', element: <NewOrder /> },
        { path: '/confirm', element: <Confirm /> },
        {
          path: '/address/:end',
          element: (
            <Suspense fallback={<div className="screen"><div className="skeleton h-[46vh] rounded-[22px]" /></div>}>
              <Address />
            </Suspense>
          ),
        },
        { path: '/working/:id', element: <Working /> },
        { path: '/result/:id', element: <Result /> },
        { path: '/orders', element: <Orders /> },
        { path: '/track/:id', element: <Track /> },
        { path: '/carrier', element: <Carrier /> },
        { path: '/day', element: <Day /> },
        // Служебный: в навигации его нет, открывается только по адресу.
        { path: '/demo', element: <Demo /> },
      ]
    : [{ path: '*', element: <Setup /> }],
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
