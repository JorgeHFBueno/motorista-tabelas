import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import TabelaCombustivel from './components/TabelaCombustivel';
import Header from './components/Header';
import PortifolioPage from './components/PortifolioPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PrivateRoute from './components/PrivateRoute';
import Frota from './pages/Frota';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';

export default function App() {
  return (
   <BrowserRouter>
   <NetworkStatusBanner />
      <PwaUpdateBanner />
      <Header />
       <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<PrivateRoute />}>
          <Route path="/combustivel" element={<TabelaCombustivel />} />
          <Route path="/frota" element={<Frota />} />
          <Route path="/" element={<PortifolioPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}