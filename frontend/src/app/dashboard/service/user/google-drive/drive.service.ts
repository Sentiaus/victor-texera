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

import { Injectable, NgZone } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { AppSettings } from "../../../../common/app-setting";

declare var gapi: any;
declare var google: any;

export interface DriveFolder {
  id: string;
  name: string;
}

@Injectable({
  providedIn: "root",
})
export class DriveService {
  private readonly CONNECT_URL = `${AppSettings.getApiEndpoint()}/auth/google/drive/connect`;

  private pickerLoaded = false;

  constructor(
    private http: HttpClient,
    private ngZone: NgZone
  ) {}

  connect(): Observable<{ token: string; apiKey: string }> {
    return new Observable(observer => {
      let popupCleanup: (() => void) | undefined;

      const subscription = this.http.get<{ url: string; apiKey: string }>(this.CONNECT_URL).subscribe({
        next: ({ url, apiKey }) => {
          const popup = window.open(url, "gdrive-connect", "width=500,height=600");

          if (!popup) {
            observer.error(new Error("Popup blocked. Please allow popups for this site."));
            return;
          }

          const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.source !== popup) return;
            let data: { type: string; token?: string };
            try {
              data = JSON.parse(event.data);
            } catch {
              return;
            }
            if (data.type === "gdrive-connected" && data.token) {
              window.removeEventListener("message", onMessage);
              popup.close();
              this.ngZone.run(() => {
                observer.next({ token: data.token!, apiKey });
                observer.complete();
              });
            } else if (data.type === "gdrive-error") {
              window.removeEventListener("message", onMessage);
              this.ngZone.run(() => {
                observer.error(new Error("Google Drive connection failed"));
              });
            }
          };

          window.addEventListener("message", onMessage);
          popupCleanup = () => {
            window.removeEventListener("message", onMessage);
            popup.close();
          };
        },
        error: (err: unknown) => observer.error(err),
      });

      return () => {
        subscription.unsubscribe();
        popupCleanup?.();
      };
    });
  }

  openFolderPicker(token: string, apiKey: string): Observable<DriveFolder> {
    return new Observable(observer => {
      this.loadPicker().then(() => {
        const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes("application/vnd.google-apps.folder");

        const picker = new google.picker.PickerBuilder()
          .addView(folderView)
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          .setTitle("Choose a folder to export to")
          .setCallback((data: any) => {
            if (data.action === google.picker.Action.PICKED) {
              const doc = data.docs[0];
              this.ngZone.run(() => {
                observer.next({ id: doc.id, name: doc.name });
                observer.complete();
              });
            } else if (data.action === google.picker.Action.CANCEL) {
              this.ngZone.run(() => observer.complete());
            }
          })
          .build();

        picker.setVisible(true);
      });
    });
  }

  private loadPicker(): Promise<void> {
    if (this.pickerLoaded) return Promise.resolve();
    return new Promise(resolve => {
      gapi.load("picker", () => {
        this.pickerLoaded = true;
        resolve();
      });
    });
  }
}
