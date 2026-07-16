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

import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { NzModalService } from "ng-zorro-antd/modal";
import { of, throwError, EMPTY, Subject } from "rxjs";
import type { Mocked } from "vitest";

import { DatasetDetailComponent } from "./dataset-detail.component";
import { DriveService } from "../../../../service/user/google-drive/drive.service";
import { NotificationService } from "../../../../../common/service/notification/notification.service";
import { DownloadService } from "../../../../service/user/download/download.service";
import { DatasetService } from "../../../../service/user/dataset/dataset.service";
import { UserService } from "../../../../../common/service/user/user.service";
import { StubUserService } from "../../../../../common/service/user/stub-user.service";
import { commonTestProviders } from "../../../../../common/testing/test-utils";
import { DatasetVersion } from "../../../../../common/type/dataset";
import { MarkdownService } from "ngx-markdown";

// NzResizableDirective requires ResizeObserver which is absent in the test environment
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("DatasetDetailComponent — Drive export", () => {
  let component: DatasetDetailComponent;
  let fixture: ComponentFixture<DatasetDetailComponent>;
  let driveServiceMock: Mocked<DriveService>;
  let notificationServiceMock: Mocked<NotificationService>;
  let downloadServiceMock: Mocked<DownloadService>;
  let datasetServiceMock: Mocked<DatasetService>;

  const stubVersion: DatasetVersion = { dvid: 1, name: "v1", creationTime: 0 } as unknown as DatasetVersion;

  beforeEach(async () => {
    driveServiceMock = {
      connect: vi.fn().mockReturnValue(EMPTY),
      openFolderPicker: vi.fn().mockReturnValue(EMPTY),
      initiateResumableUpload: vi.fn().mockReturnValue(EMPTY),
    } as unknown as Mocked<DriveService>;
    notificationServiceMock = { success: vi.fn(), error: vi.fn() } as unknown as Mocked<NotificationService>;
    downloadServiceMock = {
      downloadDatasetVersion: vi.fn().mockReturnValue(EMPTY),
      downloadSingleFile: vi.fn().mockReturnValue(EMPTY),
    } as unknown as Mocked<DownloadService>;
    datasetServiceMock = {
      exportToDrive: vi.fn().mockReturnValue(EMPTY),
      exportFileToDrive: vi.fn().mockReturnValue(EMPTY),
    } as unknown as Mocked<DatasetService>;

    await TestBed.configureTestingModule({
      imports: [DatasetDetailComponent, HttpClientTestingModule, RouterTestingModule, BrowserAnimationsModule],
      providers: [
        NzModalService,
        { provide: UserService, useClass: StubUserService },
        { provide: DriveService, useValue: driveServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: DownloadService, useValue: downloadServiceMock },
        { provide: DatasetService, useValue: datasetServiceMock },
        { provide: MarkdownService, useValue: { parse: vi.fn(), render: vi.fn() } },
        ...commonTestProviders,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Set after detectChanges so ngOnInit's route-param assignment doesn't overwrite them
    component.did = 1;
    component.selectedVersion = stubVersion;
  });

  describe("onClickDriveExportVersion", () => {
    it("calls driveService.connect()", () => {
      component.onClickDriveExportVersion();
      expect(driveServiceMock.connect).toHaveBeenCalled();
    });

    it("shows error notification when connect fails", () => {
      driveServiceMock.connect.mockReturnValue(throwError(() => new Error("blocked")));

      component.onClickDriveExportVersion();

      expect(notificationServiceMock.error).toHaveBeenCalledWith("Failed to export to Google Drive");
    });

    it("passes token/apiKey to openFolderPicker, folder id to initiateResumableUpload, and session URI to exportToDrive", () => {
      component.datasetName = "My Dataset";
      const connect$ = new Subject<{ token: string; apiKey: string }>();
      const picker$ = new Subject<{ id: string; name: string }>();
      driveServiceMock.connect.mockReturnValue(connect$.asObservable());
      driveServiceMock.openFolderPicker.mockReturnValue(picker$.asObservable());
      driveServiceMock.initiateResumableUpload.mockReturnValue(of("https://session-uri"));
      datasetServiceMock.exportToDrive.mockReturnValue(of(undefined));

      component.onClickDriveExportVersion();
      connect$.next({ token: "tok", apiKey: "key" });

      expect(driveServiceMock.openFolderPicker).toHaveBeenCalledWith("tok", "key");

      picker$.next({ id: "folder-123", name: "My Folder" });

      expect(driveServiceMock.initiateResumableUpload).toHaveBeenCalledWith(
        "tok",
        "folder-123",
        "My Dataset.zip",
        "application/zip"
      );
      expect(datasetServiceMock.exportToDrive).toHaveBeenCalledWith(1, "https://session-uri", stubVersion.dvid);
      expect(notificationServiceMock.success).toHaveBeenCalledWith('Exported "My Dataset" to Google Drive');
    });
  });

  describe("onClickDriveExportFile", () => {
    beforeEach(() => {
      component.currentDisplayedFileName = "some/path/file.txt";
    });

    it("calls driveService.connect()", () => {
      component.onClickDriveExportFile();
      expect(driveServiceMock.connect).toHaveBeenCalled();
    });

    it("shows error notification when connect fails", () => {
      driveServiceMock.connect.mockReturnValue(throwError(() => new Error("blocked")));

      component.onClickDriveExportFile();

      expect(notificationServiceMock.error).toHaveBeenCalledWith("Failed to export to Google Drive");
    });

    it("passes token/apiKey to openFolderPicker, folder id to initiateResumableUpload, and session URI to exportFileToDrive", () => {
      const connect$ = new Subject<{ token: string; apiKey: string }>();
      const picker$ = new Subject<{ id: string; name: string }>();
      driveServiceMock.connect.mockReturnValue(connect$.asObservable());
      driveServiceMock.openFolderPicker.mockReturnValue(picker$.asObservable());
      driveServiceMock.initiateResumableUpload.mockReturnValue(of("https://session-uri"));
      datasetServiceMock.exportFileToDrive.mockReturnValue(of(undefined));

      component.onClickDriveExportFile();
      connect$.next({ token: "tok", apiKey: "key" });

      expect(driveServiceMock.openFolderPicker).toHaveBeenCalledWith("tok", "key");

      picker$.next({ id: "folder-123", name: "My Folder" });

      expect(driveServiceMock.initiateResumableUpload).toHaveBeenCalledWith(
        "tok",
        "folder-123",
        "file.txt",
        "application/octet-stream"
      );
      expect(datasetServiceMock.exportFileToDrive).toHaveBeenCalledWith("some/path/file.txt", "https://session-uri");
      expect(notificationServiceMock.success).toHaveBeenCalledWith('Exported "file.txt" to Google Drive');
    });
  });
});
