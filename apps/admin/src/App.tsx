import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AdminLayout from './components/Layout/AdminLayout';
import LoginPage from './pages/Login';
import ProductList from './pages/Products/ProductList';
import ProductForm from './pages/Products/ProductForm';
import CategoriesPage from './pages/Categories';
import CollectionsPage from './pages/Collections';
import TagsPage from './pages/Tags';
import OrdersPage from './pages/Orders';
import CouponsPage from './pages/Coupons';
import SettingsPage from './pages/Settings';
import HomepagePage from './pages/Homepage';
import CustomersPage from './pages/Customers';
import DashboardPage from './pages/Dashboard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-kb-cream">
        <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ComingSoon({ title }: { title: string }) {
  return (
    <AdminLayout title={title}>
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl bg-kb-cream flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-kb-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-kb-charcoal mb-1">{title}</h2>
        <p className="text-kb-muted text-sm">This section is coming soon.</p>
      </div>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Navigate to="/dashboard" replace /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><ProductList /></ProtectedRoute>} />
      <Route path="/products/new" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
      <Route path="/products/:id/edit" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
      <Route path="/tags" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
      <Route path="/collections" element={<ProtectedRoute><CollectionsPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/coupons" element={<ProtectedRoute><CouponsPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/homepage" element={<ProtectedRoute><HomepagePage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}
