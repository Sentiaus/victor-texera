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
import { Observable, forkJoin } from "rxjs";
import { map } from "rxjs/operators";
import { GoogleAuthService } from "../../../../common/service/user/google-auth.service";

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
  private pickerLoaded = false;

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    private googleAuthService: GoogleAuthService
  ) {}

  connect(): Observable<{ token: string; apiKey: string }> {
    return new Observable(observer => {
      const subscription = forkJoin({
        clientId: this.googleAuthService.getClientId(),
        apiKey: this.googleAuthService.getDriveApiKey(),
      }).subscribe({
        next: ({ clientId, apiKey }) => {
          if (typeof google === "undefined") {
            observer.error(new Error("Google Identity Services not loaded"));
            return;
          }
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: "https://www.googleapis.com/auth/drive.file",
            callback: (response: any) => {
              if (response.error) {
                this.ngZone.run(() => observer.error(new Error(response.error)));
                return;
              }
              this.ngZone.run(() => {
                observer.next({ token: response.access_token, apiKey });
                observer.complete();
              });
            },
          });
          tokenClient.requestAccessToken();
        },
        error: (err: unknown) => observer.error(err),
      });

      return () => subscription.unsubscribe();
    });
  }

  openFolderPicker(token: string, apiKey: string): Observable<DriveFolder> {
    return new Observable(observer => {
      this.loadPicker()
        .then(() => {
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
        })
        .catch(err => this.ngZone.run(() => observer.error(err)));
    });
  }

  initiateResumableUpload(token: string, folderId: string, fileName: string, mimeType: string): Observable<string> {
    const metadata = { name: fileName, parents: [folderId], mimeType };
    return this.http
      .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", metadata, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType,
        },
        observe: "response",
        responseType: "text",
      })
      .pipe(
        map(response => {
          const location = response.headers.get("Location");
          if (!location) throw new Error("Google Drive did not return a session URI");
          return location;
        })
      );
  }

  private loadPicker(): Promise<void> {
    if (this.pickerLoaded) return Promise.resolve();
    if (typeof gapi === "undefined") return Promise.reject(new Error("Google API (gapi) not loaded"));
    return new Promise((resolve, reject) => {
      gapi.load("picker", {
        callback: () => {
          this.pickerLoaded = true;
          resolve();
        },
        onerror: (err: unknown) => reject(new Error(`Failed to load Google Picker: ${err}`)),
      });
    });
  }
}
