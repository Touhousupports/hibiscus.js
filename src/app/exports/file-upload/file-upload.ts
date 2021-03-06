import {
  ViewChild,
  ElementRef,
  Input,
  AfterViewInit,
  Renderer2,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  TemplateRef,
} from '@angular/core';
import { SelectFileModel } from './file-upload.model';
import { readFileAsDataURL } from '../utils/dom-utils';
import { formatFileSize, formatString } from '../utils/lange-utils';
import { HiNGConfig } from '../hi.config';
import { HttpClient } from '@angular/common/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import { of } from 'rxjs/observable/of';
import { forkJoin } from 'rxjs/observable/forkJoin';
import { noop } from '../utils';
import { Observable } from 'rxjs/Observable';

export class FileUpload implements AfterViewInit {

  @Input() accept: string;
  @Input() multiple = true;
  @Input() autoUpload: boolean;
  @Input() showErrors = true;
  @Input() maxItems: number;
  @Input() maxFileSize: number; // bytes
  @Input() uploadUrl: string;
  @Input() uploadParamName: string;
  @Input() uploadRequestOptions: any;
  @Input() imgPreview: boolean;
  @Input() previewWidth: string;
  @Input() previewHeight: string;
  @Input() cssClass: string;
  @Input() fileSizeErrorMessage: string;
  @Input() fileTypeErrorMessage: string;
  @Input() chooseButton: string;
  @Input() uploadButton: string;
  @Input() cancelButton: string;
  @Input() plusIcon: string;
  @Input() uploadIcon: string;
  @Input() loadingIcon: string;
  @Input() removeIcon: string;
  @Input() toolbarTemplate: TemplateRef<any>;
  @Input() previewTemplate: TemplateRef<any>;
  @Output() selectFilesChange = new EventEmitter<SelectFileModel[]>();
  @Output() fileUploadStart = new EventEmitter<SelectFileModel[]>();
  @Output() fileUploadCompleted = new EventEmitter<SelectFileModel[]>();
  @Output() fileUploadSuccess = new EventEmitter<SelectFileModel>();
  @Output() fileUploadError = new EventEmitter<SelectFileModel>();
  @Output() removeFiles = new EventEmitter<SelectFileModel[]>();
  @Output() uploadFilesChange = new EventEmitter<SelectFileModel[]>();
  @Input() uploadFiles: SelectFileModel[] = [];
  @ViewChild('file', {static: false}) fileInput: ElementRef;
  selectFiles: SelectFileModel[] = [];
  isUploading: boolean;
  errors: string[] = [];

  constructor(protected hiNGConfig: HiNGConfig,
              protected renderer: Renderer2,
              protected http: HttpClient,
              protected changeDetectorRef: ChangeDetectorRef) {

    this.fileSizeErrorMessage = this.hiNGConfig.fileUpload.fileSizeErrorMessage;
    this.fileTypeErrorMessage = this.hiNGConfig.fileUpload.fileTypeErrorMessage;
    this.uploadParamName = this.hiNGConfig.fileUpload.uploadParamName;
    this.previewWidth = this.hiNGConfig.fileUpload.previewWidth;
    this.previewHeight = this.hiNGConfig.fileUpload.previewHeight;
    this.imgPreview = this.hiNGConfig.fileUpload.imgPreview;
    this.chooseButton = this.hiNGConfig.fileUpload.chooseButton;
    this.uploadButton = this.hiNGConfig.fileUpload.uploadButton;
    this.cancelButton = this.hiNGConfig.fileUpload.cancelButton;
    this.plusIcon = this.hiNGConfig.fileUpload.plusIcon;
    this.uploadIcon = this.hiNGConfig.fileUpload.uploadIcon;
    this.loadingIcon = this.hiNGConfig.fileUpload.loadingIcon;
    this.removeIcon = this.hiNGConfig.fileUpload.removeIcon;
    this.showErrors = this.hiNGConfig.fileUpload.showErrors;

  }

  ngAfterViewInit(): void {
    if (this.accept) {
      this.renderer.setProperty(this.fileInput.nativeElement, 'accept', this.accept);
    }

    this.renderer.setProperty(this.fileInput.nativeElement, 'multiple', this.multiple);
  }

  isMoreThanMaxItems() {
    const fileSize = this.getFileCount();
    if (!this.multiple) {
      return fileSize >= 1;
    }
    return this.maxItems && (fileSize >= this.maxItems);
  }

  clearErrors() {
    this.errors = [];
  }

  onDropFiles($event) {
    $event.stopPropagation();
    $event.preventDefault();
    this.clearErrors();
    const files = $event.dataTransfer.files;
    if (files && files.length) {
      this.handleFileChoose(files);
    }
  }

  addNewFile($event) {
    $event.stopPropagation();
    if (!this.isMoreThanMaxItems()) {
      this.fileInput.nativeElement.value = null;
      this.fileInput.nativeElement.click(); // simulate file input event
    }
  }

  newFileChoose(fileInput: HTMLInputElement) {
    this.clearErrors();
    if (fileInput.files && fileInput.files.length) {
      this.handleFileChoose(fileInput.files);
    }
  }

  removeAllSelectedFiles() {
    const files = this.selectFiles;
    this.selectFiles = [];
    this.clearErrors();
    this.removeFiles.emit(files);
  }

  onRemoveFile(fileItem) {
    this.selectFiles = this.selectFiles.filter(item => item !== fileItem);
    this.removeFiles.emit([fileItem]);
  }

  onRemoveUploadFile(fileItem) {
    this.uploadFiles = this.uploadFiles.filter(item => item !== fileItem);
    this.removeFiles.emit([fileItem]);
    this.uploadFilesChange.emit(this.uploadFiles);
  }

  uploadAllFiles() {
    this.clearErrors();
    this.httpUploadAllFile(this.selectFiles);
  }

  httpUploadAllFile(files) {
    this.isUploading = true;
    this.fileUploadStart.emit(files);
    const subscriptions = files.map(fileItem => this.httpUploadFile(fileItem));
    forkJoin(subscriptions)
      .subscribe(noop, noop, () => {
        this.isUploading = false;
        this.fileUploadCompleted.emit(files);
      });
  }

  httpUploadFile(fileItem) {
    const formData = new FormData();
    formData.append(this.uploadParamName, fileItem.file);
    return this.http.post(this.uploadUrl, formData, this.uploadRequestOptions)
      .map((res) => this.onFileUploadSuccess(fileItem, res))
      .catch((error) => this.onFileUploadError(fileItem, error));
  }

  protected onFileUploadSuccess(fileItem, res): Observable<any> {
    fileItem.uploadResponse = res;
    this.selectFiles = this.selectFiles.filter(item => item !== fileItem);
    this.uploadFiles = [...(this.uploadFiles || []), fileItem];
    this.fileUploadSuccess.emit(fileItem);
    this.uploadFilesChange.emit(this.uploadFiles);
    this.changeDetectorRef.markForCheck();
    return of({ result: res, success: true });
  }

  protected onFileUploadError(fileItem, error): Observable<any> {
    this.errors.push(`${fileItem.name}: ${error.error || error.statusText}`);
    this.fileUploadError.emit({
      name: fileItem.name,
      displaySize: fileItem.displaySize,
      dataUrl: fileItem.dataUrl,
      file: fileItem.file,
      uploadResponse: error
    });

    this.changeDetectorRef.markForCheck();
    return of({ error: error, success: false });
  }

  private handleFileChoose(uploadFiles: FileList) {
    const files = this.validFiles(Array.from(uploadFiles));
    this.mapFileModel(files)
      .then(fileModels => {
        this.selectFiles = [...this.selectFiles, ...fileModels];
        this.selectFilesChange.emit(this.selectFiles);
        this.changeDetectorRef.markForCheck();
        return fileModels || [];
      })
      .then((fileModels) => {
        if (this.autoUpload) {
          return this.httpUploadAllFile(fileModels);
        }
      });
  }

  validFiles(files: File[]): File[] {
    const fileCount = this.getFileCount();
    const size = this.multiple ? this.maxItems : 1;
    if (size && (fileCount + files.length > size)) {
      files = files.slice(0, size - fileCount);
    }

    return files.filter(file => {
      return this.validFile(file);
    });
  }

  validFile(file: File): boolean {
    const errors = [];
    if (this.maxFileSize && file.size > this.maxFileSize) {
      errors.push(formatString(this.fileSizeErrorMessage, file.name, formatFileSize(this.maxFileSize)));
    }

    if (this.accept && !this.validFileType(file)) {
      errors.push(formatString(this.fileTypeErrorMessage, file.name, this.accept));
    }

    this.errors.push(...errors);
    this.fileUploadError.emit({
      name: file.name,
      file: file,
      uploadResponse: this.errors
    });
    return !errors.length;
  }

  private getFileCount() {
    return ((this.selectFiles || []).length + (this.uploadFiles || []).length);
  }

  private validFileType(file: File) {
    return this.accept.split(',').some(type => {
      return new RegExp(`^${type.replace(/\*/g, '.*')}$`).test(file.type);
    });
  }

  mapFileModel(files: File[]): Promise<SelectFileModel[]> {
    return Promise.all(files.map(file => {
      return readFileAsDataURL(file)
        .then(dataUrl => ({ dataUrl, name: file.name, file, displaySize: formatFileSize(file.size) }));
    }));

  }
}
