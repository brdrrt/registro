import { BaseClient, Issuer, TokenSet } from "npm:openid-client";
import { randomBytes } from "node:crypto";
import { generators } from "npm:openid-client";
import {
  CookieJar,
  wrapFetch,
} from "https://deno.land/x/another_cookiejar@v5.0.3/mod.ts";

// Per la permanenza dei cookies
const cookieJar = new CookieJar();
const fetch = wrapFetch({ cookieJar });

export class ArgoAPI {
  username: string;
  password: string;
  schoolCode: string;
  #tokenSet?: TokenSet;
  #authToken?: string;
  #client?: BaseClient;

  static baseApiUrl = "https://www.portaleargo.it/appfamiglia/api/rest";
  static endpoints = {
    dashboard: `${ArgoAPI.baseApiUrl}/dashboard/dashboard`,
  };

  constructor(username: string, password: string, schoolCode: string) {
    this.username = username;
    this.password = password;
    this.schoolCode = schoolCode;
  }

  async login() {
    const argoIssuer = await Issuer.discover("https://auth.portaleargo.it");
    const authenticationUrl = "https://www.portaleargo.it/auth/sso/login";
    const tokenUrl = "https://auth.portaleargo.it/oauth2/token";
    const loginUrl = "https://www.portaleargo.it/appfamiglia/api/rest/login";

    this.#client = new argoIssuer.Client({
      client_id: "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c",
      client_secret: randomBytes(256).toString("base64"),
      redirect_uris: ["it.argosoft.didup.famiglia.new://login-callback"],
      response_types: ["code"],
    });

    const code_verifier = generators.codeVerifier();
    const code_challenge = generators.codeChallenge(code_verifier);
    const state = generators.state();

    const authorizationUrl = this.#client.authorizationUrl({
      scope: "openid offline profile user.roles argo",
      code_challenge: code_challenge,
      state: state,
      code_challenge_method: "S256",
    });

    let response: Response;

    response = await fetch(authorizationUrl, { redirect: "manual" });
    response = await fetch(response.headers.get("location")!, {
      redirect: "manual",
    });

    const challenge = new URL(response.url).searchParams.get("login_challenge");
    const urlEncodedData = new URLSearchParams({
      client_id: this.#client.metadata.client_id,
      username: this.username,
      password: this.password,
      famiglia_customer_code: this.schoolCode,
      challenge: challenge!,
      prefill: "false",
      login: "true",
    });

    response = await fetch(authenticationUrl, {
      method: "POST",
      redirect: "manual",
      body: urlEncodedData,
    });

    response = await fetch(response.headers.get("location")!, {
      redirect: "manual",
    });

    response = await fetch(response.headers.get("location")!, {
      redirect: "manual",
    });

    response = await fetch(response.headers.get("location")!, {
      method: "POST",
      redirect: "manual",
      body: new URL(response.url).searchParams,
    });

    response = await fetch(tokenUrl, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({
        code: new URL(response.headers.get("location")!).searchParams.get(
          "code"
        )!,
        grant_type: "authorization_code",
        redirect_uri: this.#client.metadata.redirect_uris![0],
        code_verifier: code_verifier,
        client_id: this.#client.metadata.client_id,
      }),
    });

    const jsonBody = await response.json();

    this.#tokenSet = new TokenSet({
      access_token: jsonBody.access_token,
      token_type: "Bearer",
      id_token: jsonBody.id_token,
      refresh_token: jsonBody.refresh_token,
      expires_at: jsonBody.expires_at,
      session_state: jsonBody.session_state,
    });

    const userInfo = await this.#client.userinfo(this.#tokenSet.access_token!);

    console.log(
      `Accesso eseguito come «${userInfo.full_name}», profilo di tipo «${userInfo.user_type}» / «${userInfo.roles}»`
    );

    // Ottenimento del token d'autenticazione
    // (procedura specifica, fine flow standard OpenID Connect)

    response = await fetch(loginUrl, {
      redirect: "manual",
      method: "POST",
      body: JSON.stringify({
        clientId: this.#client.metadata.client_id,
      }),
      headers: {
        authorization: `Bearer ${this.#tokenSet.access_token!}`,
        "content-type": "text/json",
      },
    });

    this.#authToken = (await response.json()).data[0].token;

    console.log(`Ottenuto token d'auteticazione: ${this.#authToken}`);
  }

  async dashboard() {
    if (this.#tokenSet && this.#authToken) {
      return (
        await (
          await this.#getResource(
            ArgoAPI.endpoints.dashboard,
            this.#authToken,
            this.#tokenSet.access_token!,
            this.schoolCode,
            {
              dataultimoaggiornamento: "2023-01-01 12:25:51.496648",
            }
          )
        ).json()
      ).data.dati[0]; // La risposta arriva in un formato strano, estraggo solo i dati utili
      // Esempio di risposta: ({ success: true | false, msg: any, data: { dati: [<dati utili>] } })
    }
    throw new Error('Not logged in, plese call method "login()" first', {
      cause: "Method login() hasn't been called yet",
    });
  }

  async reminders() {
    return (await this.dashboard()).promemoria;
  }

  /**
   * Accede ad una risorsa che richiede l'autenticazione
   */
  async #getResource(
    url: URL | string | Request,
    authToken: string,
    accessToken: string,
    schoolCode: string,
    body?: Record<string, string>
  ): Promise<Response> {
    if (this.#tokenSet!.expired()) {
      this.#tokenSet = await this.#client!.refresh(
        this.#tokenSet!.refresh_token!
      );
    }

    const headers: Record<string, string> = {
      "x-cod-min": schoolCode,
      "x-auth-token": authToken,
      Authorization: `Bearer ${accessToken}`,
    };
    body ? (headers["content-type"] = "text/json") : null;
    return fetch(url, {
      method: body ? "POST" : "GET",
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}
