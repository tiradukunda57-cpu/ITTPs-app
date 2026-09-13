const API_BASE_URL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000'
    : '';

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.message ||
      errorData.error ||
      'Harabaye ikosa rya server.'
    );
  }

  return response.json();
}

const API = {
  get(endpoint) {
    return apiFetch(endpoint);
  },

  post(endpoint, data) {
    return apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  patch(endpoint, data) {
    return apiFetch(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  del(endpoint) {
    return apiFetch(endpoint, {
      method: 'DELETE',
    });
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  },
};
