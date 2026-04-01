import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function AdminDevice() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('admindevice', 'true');
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
}
