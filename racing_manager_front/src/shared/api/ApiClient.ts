import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';

export class ApiClient {
  private readonly client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      withCredentials: true,
      timeout: 15_000,
    });
  }

  public async get<TResponse>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<TResponse> {
    const response = await this.client.get<TResponse>(url, config);
    return response.data;
  }

  public async post<TResponse>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<TResponse> {
    const response = await this.client.post<TResponse>(url, data, config);
    return response.data;
  }

  public async postResult<TResponse>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<{ status: number; data: TResponse }> {
    const response = await this.client.post<TResponse>(url, data, config);
    return { status: response.status, data: response.data };
  }

  public async patchResult<TResponse>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<{ status: number; data: TResponse }> {
    const response = await this.client.patch<TResponse>(url, data, config);
    return { status: response.status, data: response.data };
  }

  public async putResult<TResponse>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<{ status: number; data: TResponse }> {
    const response = await this.client.put<TResponse>(url, data, config);
    return { status: response.status, data: response.data };
  }

  public async request<TResponse>(
    config: AxiosRequestConfig,
  ): Promise<TResponse> {
    const response: AxiosResponse<TResponse> = await this.client.request(config);
    return response.data;
  }

  public isUnauthorized(error: unknown): boolean {
    return (
      error instanceof AxiosError &&
      (error.response?.status === 401 || error.response?.status === 403)
    );
  }
}

export const apiClient = new ApiClient('/api');
