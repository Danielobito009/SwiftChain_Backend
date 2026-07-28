import axios from 'axios';
import { SeededDriver } from '../models/types';

/**
 * Service layer: exchanges seeded driver credentials for a real JWT by
 * calling the live `POST /api/v1/auth/login` endpoint — the same code path
 * a real driver app would use. No token is fabricated locally.
 */
export class AuthTokenService {
  constructor(
    private readonly baseUrl: string,
    private readonly apiVersion: string,
    private readonly password: string,
  ) {}

  public async login(driver: SeededDriver): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/api/${this.apiVersion}/auth/login`,
      { email: driver.email, password: this.password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );

    const token = response.data?.data?.token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error(`Login for ${driver.email} did not return a token`);
    }

    return token;
  }
}

export default AuthTokenService;
