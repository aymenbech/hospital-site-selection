import api from './api';

// جلب قائمة المشاريع
export const getProjects = async () => {
  const response = await api.get('/projects/?skip=0&limit=100');
  return response.data;
};

// إنشاء مشروع جديد
export const createProject = async (projectData) => {
  const response = await api.post('/projects/', projectData);
  return response.data;
};

// رفع ملف Dataset (Excel أو CSV)
export const uploadDataset = async (projectId, file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post(`/projects/${projectId}/datasets/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// جلب ملفات البيانات لمشروع معين
export const getProjectDatasets = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/datasets`);
  return response.data;
};