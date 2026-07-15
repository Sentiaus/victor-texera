/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { TestBed, fakeAsync, tick } from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { NgZone } from "@angular/core";
import { DriveService } from "./drive.service";
import { AppSettings } from "../../../../common/app-setting";
import { commonTestProviders } from "../../../../common/testing/test-utils";

const CLIENT_ID_URL = `${AppSettings.getApiEndpoint()}/auth/google/clientid`;
const API_KEY_URL = `${AppSettings.getApiEndpoint()}/auth/google/drive/apikey`;

function mockGoogleGIS(captureCallback: { fn?: (response: any) => void }): { requestAccessToken: ReturnType<typeof vi.fn> } {
  const mockTokenClient = { requestAccessToken: vi.fn() };
  (window as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn().mockImplementation((config: any) => {
          captureCallback.fn = config.callback;
          return mockTokenClient;
        }),
      },
    },
  };
  return mockTokenClient;
}

describe("DriveService", () => {
  let service: DriveService;
  let httpMock: HttpTestingController;
  let ngZone: NgZone;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DriveService, ...commonTestProviders],
    });

    service = TestBed.inject(DriveService);
    httpMock = TestBed.inject(HttpTestingController);
    ngZone = TestBed.inject(NgZone);
  });

  afterEach(() => {
    httpMock.verify();
    delete (window as any).google;
  });

  describe("connect", () => {
    it("fetches clientId and apiKey then initialises a GIS token client", fakeAsync(() => {
      const cb: { fn?: (r: any) => void } = {};
      const mockTokenClient = mockGoogleGIS(cb);

      service.connect().subscribe();

      httpMock.expectOne(CLIENT_ID_URL).flush("test-client-id");
      httpMock.expectOne(API_KEY_URL).flush("test-api-key");
      tick();

      expect((window as any).google.accounts.oauth2.initTokenClient).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: "test-client-id", scope: "https://www.googleapis.com/auth/drive.file" })
      );
      expect(mockTokenClient.requestAccessToken).toHaveBeenCalled();

      // clean up open observable
      cb.fn!({ error: "cancelled" });
    }));

    it("emits token and apiKey when the GIS callback fires with an access_token", fakeAsync(() => {
      const cb: { fn?: (r: any) => void } = {};
      mockGoogleGIS(cb);

      let result: { token: string; apiKey: string } | undefined;
      let completed = false;
      service.connect().subscribe({
        next: v => (result = v),
        complete: () => (completed = true),
      });

      httpMock.expectOne(CLIENT_ID_URL).flush("test-client-id");
      httpMock.expectOne(API_KEY_URL).flush("test-api-key");
      tick();

      ngZone.run(() => cb.fn!({ access_token: "tok123" }));
      tick();

      expect(result).toEqual({ token: "tok123", apiKey: "test-api-key" });
      expect(completed).toBe(true);
    }));

    it("errors the observable when the GIS callback fires with an error", fakeAsync(() => {
      const cb: { fn?: (r: any) => void } = {};
      mockGoogleGIS(cb);

      let errorMsg = "";
      service.connect().subscribe({ error: (e: unknown) => (errorMsg = (e as Error).message) });

      httpMock.expectOne(CLIENT_ID_URL).flush("test-client-id");
      httpMock.expectOne(API_KEY_URL).flush("test-api-key");
      tick();

      ngZone.run(() => cb.fn!({ error: "access_denied" }));
      tick();

      expect(errorMsg).toBe("access_denied");
    }));

    it("errors when the google global is not loaded", fakeAsync(() => {
      delete (window as any).google;

      let errorMsg = "";
      service.connect().subscribe({ error: (e: unknown) => (errorMsg = (e as Error).message) });

      httpMock.expectOne(CLIENT_ID_URL).flush("test-client-id");
      httpMock.expectOne(API_KEY_URL).flush("test-api-key");
      tick();

      expect(errorMsg).toBe("Google Identity Services not loaded");
    }));

    it("propagates HTTP errors from the backend", fakeAsync(() => {
      let errored = false;
      service.connect().subscribe({ error: () => (errored = true) });

      // Flushing one with an error causes forkJoin to cancel the other request immediately.
      // Only flush the first; the second is already cancelled before we can touch it.
      httpMock.expectOne(CLIENT_ID_URL).flush("Server error", { status: 500, statusText: "Internal Server Error" });
      tick();

      expect(errored).toBe(true);

      // Absorb the cancelled API_KEY_URL request so httpMock.verify() is satisfied
      httpMock.match(API_KEY_URL);
    }));

    it("does not emit after unsubscription", fakeAsync(() => {
      const cb: { fn?: (r: any) => void } = {};
      mockGoogleGIS(cb);

      let emitted = false;
      const sub = service.connect().subscribe({ next: () => (emitted = true) });

      httpMock.expectOne(CLIENT_ID_URL).flush("test-client-id");
      httpMock.expectOne(API_KEY_URL).flush("test-api-key");
      tick();

      sub.unsubscribe();

      // fire callback after unsubscribe — should not emit
      if (cb.fn) cb.fn({ access_token: "tok123" });
      tick();

      expect(emitted).toBe(false);
    }));
  });
});
