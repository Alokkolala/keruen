import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
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
import Setup from './screens/Setup'
import { isConfigured } from './lib/supabase'

const router = createBrowserRouter(
  isConfigured
    ? [
        { path: '/', element: <Home /> },
        { path: '/new', element: <NewOrder /> },
        { path: '/confirm', element: <Confirm /> },
        { path: '/working/:id', element: <Working /> },
        { path: '/result/:id', element: <Result /> },
        { path: '/orders', element: <Orders /> },
        { path: '/track/:id', element: <Track /> },
        { path: '/carrier', element: <Carrier /> },
        { path: '/day', element: <Day /> },
      ]
    : [{ path: '*', element: <Setup /> }],
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
