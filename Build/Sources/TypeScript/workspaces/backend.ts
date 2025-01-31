/*
 * This file is part of the TYPO3 CMS project.
 *
 * It is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License, either version 2
 * of the License, or any later version.
 *
 * For the full copyright and license information, please read the
 * LICENSE.txt file that was distributed with this source code.
 *
 * The TYPO3 project - inspiring people to share!
 */

import { AjaxResponse } from '@typo3/core/ajax/ajax-response';
import DocumentService from '@typo3/core/document-service';
import $ from 'jquery';
import { html } from 'lit';
import '@typo3/backend/element/icon-element';
import { SeverityEnum } from '@typo3/backend/enum/severity';
import '@typo3/backend/input/clearable';
import '@typo3/workspaces/renderable/record-table';
import '@typo3/workspaces/renderable/pagination';
import Workspaces from './workspaces';
import { default as Modal, ModalElement } from '@typo3/backend/modal';
import Persistent from '@typo3/backend/storage/persistent';
import Utility from '@typo3/backend/utility';
import windowManager from '@typo3/backend/window-manager';
import RegularEvent from '@typo3/core/event/regular-event';
import { topLevelModuleImport } from '@typo3/backend/utility/top-level-module-import';
import { selector } from '@typo3/core/literals';
import IconHelper from '@typo3/workspaces/utility/icon-helper';
import DeferredAction from '@typo3/backend/action-button/deferred-action';

enum Identifiers {
  searchForm = '#workspace-settings-form',
  searchTextField = '#workspace-settings-form input[name="search-text"]',
  searchSubmitBtn = '#workspace-settings-form button[type="submit"]',
  depthSelector = '#workspace-settings-form [name="depth"]',
  languageSelector = '#workspace-settings-form select[name="languages"]',
  stagesSelector = '#workspace-settings-form select[name="stages"]',
  workspaceActions = '.workspace-actions',
  chooseStageAction = '.workspace-actions [name="stage-action"]',
  chooseSelectionAction = '.workspace-actions [name="selection-action"]',
  chooseMassAction = '.workspace-actions [name="mass-action"]',
  container = '#workspace-panel',
  contentsContainer = '#workspace-contents',
  noContentsContainer = '#workspace-contents-empty',
  previewLinksButton = '.t3js-preview-link',
  pagination = '#workspace-pagination',
}

type Diff = { field: string, label: string, content: string, html: string };

type History = {
  differences: string | Diff[];
  datetime: string;
  user: string;
  user_avatar: string;
}

/**
 * Backend workspace module. Loaded only in Backend context, not in
 * workspace preview. Contains all JavaScript of the main BE module.
 */
class Backend extends Workspaces {
  private readonly elements: { [key: string]: JQuery } = {};
  private readonly settings: { [key: string]: string | number } = {
    dir: 'ASC',
    id: TYPO3.settings.Workspaces.id,
    depth: 1,
    language: 'all',
    limit: 30,
    query: '',
    sort: 'label_Live',
    start: 0,
    filterTxt: '',
  };
  private readonly paging: Record<string, number> = {
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
  };
  private markedRecordsForMassAction: string[] = [];
  private readonly indentationPadding: number = 26;

  constructor() {
    super();

    topLevelModuleImport('@typo3/workspaces/renderable/send-to-stage-form.js');
    topLevelModuleImport('@typo3/workspaces/renderable/comment-view.js');

    DocumentService.ready().then((): void => {
      this.getElements();
      this.registerEvents();
      this.notifyWorkspaceSwitchAction();

      // Set the depth from the main element
      this.settings.depth = this.elements.$depthSelector.val();
      this.settings.language = this.elements.$languageSelector.val();
      this.settings.stage = this.elements.$stagesSelector.val();

      // Fetch workspace info (listing) if workspace is accessible
      if (this.elements.$container.length) {
        this.getWorkspaceInfos();
      }
    });
  }

  /**
   * Reloads the page tree
   */
  private static refreshPageTree(): void {
    top.document.dispatchEvent(new CustomEvent('typo3:pagetree:refresh'));
  }

  /**
   * Generates the diff view of a record
   *
   * @param {Object} diff
   * @return {$}
   */
  private static generateDiffView(diff: Diff[]): JQuery {
    const $diff = $('<div />', { class: 'diff' });

    for (const currentDiff of diff) {
      $diff.append(
        $('<div />', { class: 'diff-item' }).append(
          $('<div />', { class: 'diff-item-title' }).text(currentDiff.label),
          $('<div />', { class: 'diff-item-result' }).html(currentDiff.content),
        ),
      );
    }
    return $diff;
  }

  /**
   * Generates the comments view of a record
   *
   * @param {Object} comments
   * @return {$}
   */
  private static generateCommentView(comments: any[]): HTMLElement {
    const commentView = document.createElement('typo3-workspaces-comment-view');
    commentView.comments = comments;

    return commentView;
  }

  /**
   * Renders the record's history
   *
   * @param {Object} data
   * @return {JQuery}
   */
  private static generateHistoryView(data: History[]): JQuery {
    const $history = $('<div />');

    for (const currentData of data) {
      const $panel = $('<div />', { class: 'panel panel-default' });
      let $diff;

      if (typeof currentData.differences === 'object') {
        if (currentData.differences.length === 0) {
          // Somehow here are no differences. What a pity, skip that record
          continue;
        }
        $diff = $('<div />', { class: 'diff' });

        for (let j = 0; j < currentData.differences.length; ++j) {
          $diff.append(
            $('<div />', { class: 'diff-item' }).append(
              $('<div />', { class: 'diff-item-title' }).text(currentData.differences[j].label),
              $('<div />', { class: 'diff-item-result' }).html(currentData.differences[j].html),
            ),
          );
        }

        $panel.append(
          $('<div />').append($diff),
        );
      } else {
        $panel.append(
          $('<div />', { class: 'panel-body' }).text(currentData.differences),
        );
      }
      $panel.append(
        $('<div />', { class: 'panel-footer' }).append(
          $('<span />', { class: 'badge badge-info' }).text(currentData.datetime),
        ),
      );

      $history.append(
        $('<div />', { class: 'media' }).append(
          $('<div />', { class: 'media-left text-center' }).text(currentData.user).prepend(
            $('<div />').html(currentData.user_avatar),
          ),
          $('<div />', { class: 'media-body' }).append($panel),
        ),
      );
    }

    return $history;
  }

  /**
   * This changes the checked state of a parent checkbox belonging
   * to the given collection (e.g. sys_file_reference > tt_content).
   *
   * This also sets a data attribute which will be respected by
   * the multi record selection module. This is to prevent the
   * module from overriding the manually changed state.
   *
   * @param {string} collection The collection identifier
   * @param {boolean} check The checked state
   */
  private static changeCollectionParentState(collection: string, check: boolean): void {
    const parent: HTMLInputElement = document.querySelector('tr[data-collection-current="' + collection + '"] input[type=checkbox]');
    if (parent !== null && parent.checked !== check) {
      parent.checked = check;
      parent.dataset.manuallyChanged = 'true';
      parent.dispatchEvent(new CustomEvent('multiRecordSelection:checkbox:state:changed', { bubbles: true, cancelable: false }));
    }
  }

  /**
   * This changes the checked state of all checkboxes belonging
   * to the given collectionCurrent. Those are the child records
   * of a parent record (e.g. tt_content > sys_file_reference).
   *
   * This also sets a data attribute which will be respected by
   * the multi record selection module. This is to prevent the
   * module from overriding the manually changed state.
   *
   * @param {string} collectionCurrent The collection current identifier
   * @param {boolean} check The checked state
   */
  private static changeCollectionChildrenState(collectionCurrent: string, check: boolean): void {
    const collectionChildren: NodeListOf<HTMLInputElement> = document.querySelectorAll(selector`tr[data-collection="${collectionCurrent}"] input[type=checkbox]`);
    if (collectionChildren.length) {
      collectionChildren.forEach((checkbox: HTMLInputElement): void => {
        if (checkbox.checked !== check) {
          checkbox.checked = check;
          checkbox.dataset.manuallyChanged = 'true';
          checkbox.dispatchEvent(new CustomEvent('multiRecordSelection:checkbox:state:changed', { bubbles: true, cancelable: false }));
        }
      });
    }
  }

  private notifyWorkspaceSwitchAction(): void {
    const mainElement = document.querySelector('main[data-workspace-switch-action]') as HTMLElement;
    if (mainElement.dataset.workspaceSwitchAction) {
      const workspaceSwitchInformation = JSON.parse(mainElement.dataset.workspaceSwitchAction);
      // we need to do this manually, but this should be done better via proper events
      top.TYPO3.WorkspacesMenu.performWorkspaceSwitch(workspaceSwitchInformation.id, workspaceSwitchInformation.title);
      top.document.dispatchEvent(new CustomEvent('typo3:pagetree:refresh'));
      top.TYPO3.ModuleMenu.App.refreshMenu();
    }
  }

  /**
   * Checks the integrity of a record
   *
   * @param {Array} payload
   * @return {$}
   */
  private checkIntegrity(payload: object): Promise<AjaxResponse> {
    return this.sendRemoteRequest(
      this.generateRemotePayload('checkIntegrity', payload),
    );
  }

  private getElements(): void {
    this.elements.$searchForm = $(Identifiers.searchForm);
    this.elements.$searchTextField = $(Identifiers.searchTextField);
    this.elements.$searchSubmitBtn = $(Identifiers.searchSubmitBtn);
    this.elements.$depthSelector = $(Identifiers.depthSelector);
    this.elements.$languageSelector = $(Identifiers.languageSelector);
    this.elements.$stagesSelector = $(Identifiers.stagesSelector);
    this.elements.$container = $(Identifiers.container);
    this.elements.$contentsContainer = $(Identifiers.contentsContainer);
    this.elements.$noContentsContainer = $(Identifiers.noContentsContainer);
    this.elements.$tableBody = this.elements.$contentsContainer.find('tbody');
    this.elements.$workspaceActions = $(Identifiers.workspaceActions);
    this.elements.$chooseStageAction = $(Identifiers.chooseStageAction);
    this.elements.$chooseSelectionAction = $(Identifiers.chooseSelectionAction);
    this.elements.$chooseMassAction = $(Identifiers.chooseMassAction);
    this.elements.$previewLinksButton = $(Identifiers.previewLinksButton);
    this.elements.$pagination = $(Identifiers.pagination);
  }

  private registerEvents(): void {
    $(document).on('click', '[data-action="publish"]', (e: JQueryEventObject): void => {
      const row = <HTMLTableRowElement>e.target.closest('tr');
      this.checkIntegrity(
        {
          selection: [
            {
              liveId: row.dataset.uid,
              versionId: row.dataset.t3ver_oid,
              table: row.dataset.table,
            },
          ],
          type: 'selection',
        },
      ).then(async (response: AjaxResponse): Promise<void> => {
        if ((await response.resolve())[0].result.result === 'warning') {
          this.openIntegrityWarningModal().addEventListener('confirm.button.ok', (): void => {
            this.renderPublishModal(row)
          });
        } else {
          this.renderPublishModal(row);
        }
      });
    }).on('click', '[data-action="prevstage"]', (e: JQueryEventObject): void => {
      this.sendToStage($(e.currentTarget).closest('tr'), 'prev');
    }).on('click', '[data-action="nextstage"]', (e: JQueryEventObject): void => {
      this.sendToStage($(e.currentTarget).closest('tr'), 'next');
    }).on('click', '[data-action="changes"]', this.viewChanges)
      .on('click', '[data-action="preview"]', this.openPreview.bind(this))
      .on('click', '[data-action="open"]', (e: JQueryEventObject): void => {
        const row = <HTMLTableRowElement>e.currentTarget.closest('tr');
        const newUrl = TYPO3.settings.FormEngine.moduleUrl
          + '&returnUrl=' + encodeURIComponent(document.location.href)
          + '&id=' + TYPO3.settings.Workspaces.id + '&edit[' + row.dataset.table + '][' + row.dataset.uid + ']=edit';

        window.location.href = newUrl;
      }).on('click', '[data-action="version"]', (e: JQueryEventObject): void => {
        const row = <HTMLTableRowElement>e.currentTarget.closest('tr');
        const recordUid = row.dataset.table === 'pages' ? row.dataset.t3ver_oid : row.dataset.pid;
        window.location.href = TYPO3.settings.WebLayout.moduleUrl
        + '&id=' + recordUid;
      }).on('click', '[data-action="remove"]', this.confirmDeleteRecordFromWorkspace)
      .on('click', '[data-action="expand"]', (e: JQueryEventObject): void => {
        const $me = $(e.currentTarget);
        let iconIdentifier;

        if ($me.first().attr('aria-expanded') === 'true') {
          iconIdentifier = 'actions-caret-down';
        } else {
          iconIdentifier = 'actions-caret-right';
        }

        $me.empty().append(IconHelper.getIcon(iconIdentifier));
      });
    $(window.top.document).on('click', '.t3js-workspace-recipients-selectall', (): void => {
      $('.t3js-workspace-recipient', window.top.document).not(':disabled').prop('checked', true);
    }).on('click', '.t3js-workspace-recipients-deselectall', (): void => {
      $('.t3js-workspace-recipient', window.top.document).not(':disabled').prop('checked', false);
    });

    this.elements.$searchForm.on('submit', (e: JQueryEventObject): void => {
      e.preventDefault();
      this.settings.filterTxt = this.elements.$searchTextField.val();
      this.getWorkspaceInfos();
    });

    this.elements.$searchTextField.on('keyup', (e: JQueryEventObject): void => {
      const me = <HTMLInputElement>e.target;

      if (me.value !== '') {
        this.elements.$searchSubmitBtn.removeClass('disabled');
      } else {
        this.elements.$searchSubmitBtn.addClass('disabled');
        this.getWorkspaceInfos();
      }
    });

    const searchTextField = <HTMLInputElement>this.elements.$searchTextField.get(0);
    if (searchTextField !== undefined) {
      searchTextField.clearable(
        {
          onClear: (): void => {
            this.elements.$searchSubmitBtn.addClass('disabled');
            this.settings.filterTxt = '';
            this.getWorkspaceInfos();
          },
        },
      );
    }

    // checkboxes in the table
    new RegularEvent('multiRecordSelection:checkbox:state:changed', this.handleCheckboxStateChanged).bindTo(document);

    // Listen for depth changes
    this.elements.$depthSelector.on('change', (e: JQueryEventObject): void => {
      const depth = (<HTMLSelectElement>e.target).value;
      Persistent.set('moduleData.workspaces_admin.depth', depth);
      this.settings.depth = depth;
      this.getWorkspaceInfos();
    });

    // Generate preview links
    this.elements.$previewLinksButton.on('click', this.generatePreviewLinks);

    // Listen for language changes
    this.elements.$languageSelector.on('change', (e: JQueryEventObject): void => {
      const $me = $(e.target);
      Persistent.set('moduleData.workspaces_admin.language', $me.val());
      this.settings.language = $me.val();
      this.sendRemoteRequest(
        this.generateRemotePayload('getWorkspaceInfos', this.settings),
      ).then(async (response: AjaxResponse): Promise<void> => {
        const actionResponse = await response.resolve();
        this.elements.$languageSelector.prev().html($me.find(':selected').data('icon'));
        this.renderWorkspaceInfos(actionResponse[0].result);
      });
    });

    this.elements.$stagesSelector.on('change', (e: JQueryEventObject): void => {
      const stage = (<HTMLSelectElement>e.target).value;
      Persistent.set('moduleData.workspaces_admin.stage', stage);
      this.settings.stage = stage;
      this.getWorkspaceInfos();
    });

    // Listen for actions
    this.elements.$chooseStageAction.on('change', this.sendToSpecificStageAction);
    this.elements.$chooseSelectionAction.on('change', this.runSelectionAction);
    this.elements.$chooseMassAction.on('change', this.runMassAction);

    // clicking an action in the paginator
    this.elements.$pagination.on('click', '[data-action]', (e: JQueryEventObject): void => {
      e.preventDefault();

      const $el = $(e.currentTarget);
      let reload = false;

      switch ($el.data('action')) {
        case 'previous':
          if (this.paging.currentPage > 1) {
            this.paging.currentPage--;
            reload = true;
          }
          break;
        case 'next':
          if (this.paging.currentPage < this.paging.totalPages) {
            this.paging.currentPage++;
            reload = true;
          }
          break;
        case 'page':
          this.paging.currentPage = parseInt($el.data('page'), 10);
          reload = true;
          break;
        default:
          throw 'Unknown action "' + $el.data('action') + '"';
      }

      if (reload) {
        // Adjust settings
        this.settings.start = parseInt(this.settings.limit.toString(), 10) * (this.paging.currentPage - 1);
        this.getWorkspaceInfos();
      }
    });
  }

  private readonly handleCheckboxStateChanged = (e: Event): void => {
    const $checkbox = $(e.target);
    const $tr = $checkbox.parents('tr');
    const checked = $checkbox.prop('checked');
    const table = $tr.data('table');
    const uid = $tr.data('uid');
    const t3ver_oid = $tr.data('t3ver_oid');
    const record = table + ':' + uid + ':' + t3ver_oid;

    if (checked) {
      this.markedRecordsForMassAction.push(record);
    } else {
      const index = this.markedRecordsForMassAction.indexOf(record);
      if (index > -1) {
        this.markedRecordsForMassAction.splice(index, 1);
      }
    }

    if ($tr.data('collectionCurrent')) {
      // change checked state from all collection children
      Backend.changeCollectionChildrenState($tr.data('collectionCurrent'), checked);
    } else if ($tr.data('collection')) {
      // change checked state from all collection children and the collection parent
      Backend.changeCollectionChildrenState($tr.data('collection'), checked);
      Backend.changeCollectionParentState($tr.data('collection'), checked);
    }

    this.elements.$chooseMassAction.prop('disabled', this.markedRecordsForMassAction.length > 0);
  };

  /**
   * Sends a record to a stage
   *
   * @param {Object} $row
   * @param {String} direction
   */
  private sendToStage($row: JQuery, direction: string): void {
    let nextStage: string;
    let stageWindowAction: string;
    let stageExecuteAction: string;

    if (direction === 'next') {
      nextStage = $row.data('nextStage');
      stageWindowAction = 'sendToNextStageWindow';
      stageExecuteAction = 'sendToNextStageExecute';
    } else if (direction === 'prev') {
      nextStage = $row.data('prevStage');
      stageWindowAction = 'sendToPrevStageWindow';
      stageExecuteAction = 'sendToPrevStageExecute';
    } else {
      throw 'Invalid direction given.';
    }

    this.sendRemoteRequest(
      this.generateRemoteActionsPayload(stageWindowAction, [
        $row.data('uid'), $row.data('table'), $row.data('t3ver_oid'),
      ]),
    ).then(async (response: AjaxResponse): Promise<void> => {
      const modal = this.renderSendToStageWindow(await response.resolve());
      modal.addEventListener('button.clicked', (modalEvent: Event): void => {
        const target = modalEvent.target as HTMLButtonElement;
        if (target.name === 'ok') {
          const serializedForm = Utility.convertFormToObject(modal.querySelector('form'));
          serializedForm.affects = {
            table: $row.data('table'),
            nextStage: nextStage,
            t3ver_oid: $row.data('t3ver_oid'),
            uid: $row.data('uid'),
            elements: [],
          };

          this.sendRemoteRequest([
            this.generateRemoteActionsPayload(stageExecuteAction, [serializedForm]),
            this.generateRemotePayload('getWorkspaceInfos', this.settings),
          ]).then(async (response: AjaxResponse): Promise<void> => {
            const requestResponse = await response.resolve();
            modal.hideModal();
            this.renderWorkspaceInfos(requestResponse[1].result);
            Backend.refreshPageTree();
          });
        }
      });
    });
  }

  /**
   * Gets the workspace infos (= filling the contents).
   *
   * @return {Promise}
   * @protected
   */
  private getWorkspaceInfos(): void {
    this.sendRemoteRequest(
      this.generateRemotePayload('getWorkspaceInfos', this.settings),
    ).then(async (response: AjaxResponse): Promise<void> => {
      this.renderWorkspaceInfos((await response.resolve())[0].result);
    });
  }

  /**
   * Renders fetched workspace information
   *
   * @param {Object} result
   */
  private renderWorkspaceInfos(result: any): void {
    this.resetMassActionState(result.data.length);
    this.buildPagination(result.total);

    // disable the contents area
    if (result.total === 0) {
      this.elements.$contentsContainer.hide();
      this.elements.$noContentsContainer.show();
    } else {
      this.elements.$contentsContainer.show();
      this.elements.$noContentsContainer.hide();
    }

    const workspacesRecordTable = document.querySelector('typo3-workspaces-record-table');
    workspacesRecordTable.results = result.data;
  }

  /**
   * Renders the pagination
   *
   * @param {Number} totalItems
   */
  private buildPagination(totalItems: number): void {
    if (totalItems === 0) {
      this.elements.$pagination.contents().remove();
      return;
    }

    this.paging.totalItems = totalItems;
    this.paging.totalPages = Math.ceil(totalItems / parseInt(this.settings.limit.toString(), 10));

    if (this.paging.totalPages === 1) {
      // early abort if only one page is available
      this.elements.$pagination.contents().remove();
      return;
    }

    const pagination = document.createElement('typo3-workspaces-pagination');
    pagination.paging = this.paging;

    this.elements.$pagination.empty().append(pagination);
  }

  /**
   * View changes of a record
   *
   * @param {Event} e
   */
  private readonly viewChanges = (e: JQueryEventObject): void => {
    e.preventDefault();

    const $tr = $(e.currentTarget).closest('tr');
    this.sendRemoteRequest(
      this.generateRemotePayload('getRowDetails', {
        stage: $tr.data('stage'),
        t3ver_oid: $tr.data('t3ver_oid'),
        table: $tr.data('table'),
        uid: $tr.data('uid'),
        filterFields: true
      }),
    ).then(async (response: AjaxResponse): Promise<void> => {
      const item = (await response.resolve())[0].result.data[0];
      const $content = $('<div />');
      const $tabsNav = $('<ul />', { class: 'nav nav-tabs', role: 'tablist' });
      const $tabsContent = $('<div />', { class: 'tab-content' });
      const modalButtons = [];

      $content.append(
        $('<p />').html(TYPO3.lang.path.replace('{0}', item.path_Live)),
        $('<p />').html(
          TYPO3.lang.current_step.replace('{0}', item.label_Stage)
            .replace('{1}', item.stage_position)
            .replace('{2}', item.stage_count),
        ),
      );

      if (item.diff.length > 0) {
        $tabsNav.append(
          $('<li />', { role: 'presentation', class: 'nav-item' }).append(
            $('<a />', {
              class: 'nav-link',
              href: '#workspace-changes',
              'aria-controls': 'workspace-changes',
              role: 'tab',
              'data-bs-toggle': 'tab',
            }).text(TYPO3.lang['window.recordChanges.tabs.changeSummary']),
          ),
        );
        $tabsContent.append(
          $('<div />', { role: 'tabpanel', class: 'tab-pane', id: 'workspace-changes' }).append(
            $('<div />', { class: 'form-section' }).append(
              Backend.generateDiffView(item.diff),
            ),
          ),
        );
      }

      if (item.comments.length > 0) {
        $tabsNav.append(
          $('<li />', { role: 'presentation', class: 'nav-item' }).append(
            $('<a />', {
              class: 'nav-link',
              href: '#workspace-comments',
              'aria-controls': 'workspace-comments',
              role: 'tab',
              'data-bs-toggle': 'tab',
            }).html(TYPO3.lang['window.recordChanges.tabs.comments'] + '&nbsp;').append(
              $('<span />', { class: 'badge' }).text(item.comments.length),
            ),
          ),
        );
        $tabsContent.append(
          $('<div />', { role: 'tabpanel', class: 'tab-pane', id: 'workspace-comments' }).append(
            $('<div />', { class: 'form-section' }).append(
              Backend.generateCommentView(item.comments),
            ),
          ),
        );
      }

      if (item.history.total > 0) {
        $tabsNav.append(
          $('<li />', { role: 'presentation', class: 'nav-item' }).append(
            $('<a />', {
              class: 'nav-link',
              href: '#workspace-history',
              'aria-controls': 'workspace-history',
              role: 'tab',
              'data-bs-toggle': 'tab',
            }).text(TYPO3.lang['window.recordChanges.tabs.history']),
          ),
        );

        $tabsContent.append(
          $('<div />', { role: 'tabpanel', class: 'tab-pane', id: 'workspace-history' }).append(
            $('<div />', { class: 'form-section' }).append(
              Backend.generateHistoryView(item.history.data),
            ),
          ),
        );
      }

      // Mark the first tab and pane as active
      $tabsNav.find('li > a').first().addClass('active');
      $tabsContent.find('.tab-pane').first().addClass('active');

      // Attach tabs
      $content.append(
        $('<div />').append(
          $tabsNav,
          $tabsContent,
        ),
      );

      if (item.label_PrevStage !== false && $tr.data('stage') !== $tr.data('prevStage')) {
        modalButtons.push({
          text: item.label_PrevStage.title,
          active: true,
          btnClass: 'btn-default',
          name: 'prevstage',
          trigger: (e: Event, modal: ModalElement) => {
            modal.hideModal();
            this.sendToStage($tr, 'prev');
          },
        });
      }

      if (item.label_NextStage !== false) {
        modalButtons.push({
          text: item.label_NextStage.title,
          active: true,
          btnClass: 'btn-default',
          name: 'nextstage',
          trigger: (e: Event, modal: ModalElement) => {
            modal.hideModal();
            this.sendToStage($tr, 'next');
          },
        });
      }
      modalButtons.push({
        text: TYPO3.lang.close,
        active: true,
        btnClass: 'btn-info',
        name: 'cancel',
        trigger: (e: Event, modal: ModalElement) => modal.hideModal(),
      });

      Modal.advanced({
        type: Modal.types.default,
        title: TYPO3.lang['window.recordInformation'].replace('{0}', $tr.find('.t3js-title-live').text().trim()),
        content: $content,
        severity: SeverityEnum.info,
        buttons: modalButtons,
        size: Modal.sizes.medium,
      });
    });
  };

  /**
   * Opens a record in a preview window
   *
   * @param {JQueryEventObject} evt
   */
  private openPreview(evt: JQueryEventObject): void {
    const $tr = $(evt.currentTarget).closest('tr');

    this.sendRemoteRequest(
      this.generateRemoteActionsPayload('viewSingleRecord', [
        $tr.data('table'), $tr.data('uid'),
      ]),
    ).then(async (response: AjaxResponse): Promise<void> => {
      const previewUri: string = (await response.resolve())[0].result;
      windowManager.localOpen(previewUri);
    });
  }

  /**
   * Shows a confirmation modal and deletes the selected record from workspace.
   *
   * @param {Event} e
   */
  private readonly confirmDeleteRecordFromWorkspace = (e: JQueryEventObject): void => {
    const $tr = $(e.target).closest('tr');
    const modal = Modal.confirm(
      TYPO3.lang['window.discard.title'],
      TYPO3.lang['window.discard.message'],
      SeverityEnum.warning,
      [
        {
          text: TYPO3.lang.cancel,
          active: true,
          btnClass: 'btn-default',
          name: 'cancel',
          trigger: (): void => {
            modal.hideModal();
          },
        },
        {
          text: TYPO3.lang.ok,
          btnClass: 'btn-warning',
          name: 'ok',
        },
      ],
    );
    modal.addEventListener('button.clicked', (modalEvent: Event): void => {
      if ((<HTMLAnchorElement>modalEvent.target).name === 'ok') {
        this.sendRemoteRequest([
          this.generateRemoteActionsPayload('deleteSingleRecord', [
            $tr.data('table'),
            $tr.data('uid'),
          ]),
        ]).then((): void => {
          modal.hideModal();
          this.getWorkspaceInfos();
          Backend.refreshPageTree();
        });
      }
    });
  };

  /**
   * Runs a mass action
   */
  private readonly runSelectionAction = (e: JQueryEventObject): void => {
    const selectedAction = $(e.currentTarget).val();
    const integrityCheckRequired = selectedAction !== 'discard';

    if (selectedAction.length === 0) {
      // Don't do anything if that value is empty
      return;
    }

    const affectedRecords: Array<object> = [];
    for (let i = 0; i < this.markedRecordsForMassAction.length; ++i) {
      const affected = this.markedRecordsForMassAction[i].split(':');
      affectedRecords.push({
        table: affected[0],
        liveId: affected[2],
        versionId: affected[1],
      });
    }

    if (!integrityCheckRequired) {
      this.renderSelectionActionModal(selectedAction, affectedRecords);
    } else {
      this.checkIntegrity(
        {
          selection: affectedRecords,
          type: 'selection',
        },
      ).then(async (response: AjaxResponse): Promise<void> => {
        if ((await response.resolve())[0].result.result === 'warning') {
          this.openIntegrityWarningModal().addEventListener('confirm.button.ok', (): void => {
            this.renderSelectionActionModal(selectedAction, affectedRecords);
          });
        } else {
          this.renderSelectionActionModal(selectedAction, affectedRecords);
        }
      });
    }
  };

  private readonly openIntegrityWarningModal = (): ModalElement => {
    const modal = Modal.confirm(
      TYPO3.lang['window.integrity_warning.title'],
      html`<p>${TYPO3.lang['integrity.hasIssuesDescription']}<br>${TYPO3.lang['integrity.hasIssuesQuestion']}</p>`,
      SeverityEnum.warning
    );
    modal.addEventListener('button.clicked', (): void => modal.hideModal());

    return modal;
  };

  private renderPublishModal(row: HTMLTableRowElement): void {
    const modal = Modal.advanced({
      title: TYPO3.lang['window.publish.title'],
      content: TYPO3.lang['window.publish.message'],
      severity: SeverityEnum.info,
      staticBackdrop: true,
      buttons: [
        {
          text: TYPO3.lang.cancel,
          btnClass: 'btn-default',
          trigger: function(): void {
            modal.hideModal();
          },
        }, {
          text: TYPO3.lang.label_doaction_publish,
          btnClass: 'btn-info',
          action: new DeferredAction(async (): Promise<void> => {
            await this.sendRemoteRequest(
              this.generateRemoteActionsPayload('publishSingleRecord', [
                row.dataset.table,
                row.dataset.t3ver_oid,
                row.dataset.uid,
              ]),
            );
            this.getWorkspaceInfos();
            Backend.refreshPageTree();
          }),
        },
      ]
    });
  }

  private renderSelectionActionModal(selectedAction: string, affectedRecords: Array<object>): void {
    const modal = Modal.advanced({
      title: TYPO3.lang['window.selectionAction.title'],
      content: html`<p>${TYPO3.lang['tooltip.' + selectedAction + 'Selected']}</p>`,
      severity: SeverityEnum.warning,
      staticBackdrop: true,
      buttons: [
        {
          text: TYPO3.lang.cancel,
          btnClass: 'btn-default',
          trigger: function(): void {
            modal.hideModal();
          },
        }, {
          text: TYPO3.lang['label_doaction_' + selectedAction],
          btnClass: 'btn-warning',
          action: new DeferredAction(async (): Promise<void> => {
            await this.sendRemoteRequest(
              this.generateRemoteActionsPayload('executeSelectionAction', {
                action: selectedAction,
                selection: affectedRecords,
              }),
            );
            this.markedRecordsForMassAction = [];
            this.getWorkspaceInfos();
            Backend.refreshPageTree();
          }),
        },
      ]
    });
    modal.addEventListener('typo3-modal-hidden', (): void => {
      this.elements.$chooseSelectionAction.val('');
    });
  }

  /**
   * Runs a mass action
   */
  private readonly runMassAction = (e: JQueryEventObject): void => {
    const selectedAction = $(e.currentTarget).val();
    const integrityCheckRequired = selectedAction !== 'discard';

    if (selectedAction.length === 0) {
      // Don't do anything if that value is empty
      return;
    }

    if (!integrityCheckRequired) {
      this.renderMassActionModal(selectedAction);
    } else {
      this.checkIntegrity(
        {
          language: this.settings.language,
          type: selectedAction,
        },
      ).then(async (response: AjaxResponse): Promise<void> => {
        if ((await response.resolve())[0].result.result === 'warning') {
          this.openIntegrityWarningModal().addEventListener('confirm.button.ok', (): void => {
            this.renderMassActionModal(selectedAction);
          });
        } else {
          this.renderMassActionModal(selectedAction);
        }
      });
    }
  };

  private renderMassActionModal(selectedAction: string): void {
    let massAction: string;
    let continueButtonLabel: string;

    switch (selectedAction) {
      case 'publish':
        massAction = 'publishWorkspace';
        continueButtonLabel = TYPO3.lang.label_doaction_publish;
        break;
      case 'discard':
        massAction = 'flushWorkspace';
        continueButtonLabel = TYPO3.lang.label_doaction_discard;
        break;
      default:
        throw 'Invalid mass action ' + selectedAction + ' called.';
    }

    const sendRequestsUntilAllProcessed = async (response: AjaxResponse): Promise<void> => {
      const result = (await response.resolve())[0].result;
      // Make sure to process all items
      if (result.processed < result.total) {
        this.sendRemoteRequest(
          this.generateRemoteMassActionsPayload(massAction, result),
        ).then(sendRequestsUntilAllProcessed);
      } else {
        this.getWorkspaceInfos();
        Modal.dismiss();
      }
    };

    const modal = Modal.advanced({
      title: TYPO3.lang['window.massAction.title'],
      content: html`
        <p>${TYPO3.lang['tooltip.' + selectedAction + 'All']}</p>
        <p>${TYPO3.lang['tooltip.affectWholeWorkspace']}</p>
      `,
      severity: SeverityEnum.warning,
      staticBackdrop: true,
      buttons: [
        {
          text: TYPO3.lang.cancel,
          btnClass: 'btn-default',
          trigger: function(): void {
            modal.hideModal();
          },
        }, {
          text: continueButtonLabel,
          btnClass: 'btn-warning',
          action: new DeferredAction(async (): Promise<void> => {
            const response = await this.sendRemoteRequest(
              this.generateRemoteMassActionsPayload(massAction, {
                init: true,
                total: 0,
                processed: 0,
                language: this.settings.language
              }),
            );
            await sendRequestsUntilAllProcessed(response);
          }),
        },
      ]
    });
    modal.addEventListener('typo3-modal-hidden', (): void => {
      this.elements.$chooseMassAction.val('');
    });
  }

  /**
   * Sends marked records to a stage
   *
   * @param {Event} e
   */
  private readonly sendToSpecificStageAction = (e: JQueryEventObject): void => {
    const affectedRecords: Array<{ [key: string]: number | string }> = [];
    const stage = $(e.currentTarget).val();
    for (let i = 0; i < this.markedRecordsForMassAction.length; ++i) {
      const affected = this.markedRecordsForMassAction[i].split(':');
      affectedRecords.push({
        table: affected[0],
        uid: affected[1],
        t3ver_oid: affected[2],
      });
    }
    this.sendRemoteRequest(
      this.generateRemoteActionsPayload('sendToSpecificStageWindow', [
        stage, affectedRecords,
      ]),
    ).then(async (response: AjaxResponse): Promise<void> => {
      const modal = this.renderSendToStageWindow(await response.resolve());
      modal.addEventListener('button.clicked', (modalEvent: Event): void => {
        const target = modalEvent.target as HTMLButtonElement;
        if (target.name === 'ok') {
          const serializedForm = Utility.convertFormToObject(modal.querySelector('form'));
          serializedForm.affects = {
            elements: affectedRecords,
            nextStage: stage,
          };

          this.sendRemoteRequest([
            this.generateRemoteActionsPayload('sendToSpecificStageExecute', [serializedForm]),
            this.generateRemotePayload('getWorkspaceInfos', this.settings),
          ]).then(async (response: AjaxResponse): Promise<void> => {
            const actionResponse = await response.resolve();
            modal.hideModal();
            this.renderWorkspaceInfos(actionResponse[1].result);
            Backend.refreshPageTree();
          });
        }
      });
      modal.addEventListener('typo3-modal-hide', (): void => {
        this.elements.$chooseStageAction.val('');
      });
    });
  };

  /**
   * Fetches and renders available preview links
   */
  private readonly generatePreviewLinks = (): void => {
    this.sendRemoteRequest(
      this.generateRemoteActionsPayload('generateWorkspacePreviewLinksForAllLanguages', [
        this.settings.id,
      ]),
    ).then(async (response: AjaxResponse): Promise<void> => {
      const result: Record<string, string> = (await response.resolve())[0].result;
      const $list = $('<dl />');

      for (const [language, url] of Object.entries(result)) {
        $list.append(
          $('<dt />').text(language),
          $('<dd />').append(
            $('<a />', { href: url, target: '_blank' }).text(url),
          ),
        );
      }

      Modal.show(
        TYPO3.lang.previewLink,
        $list,
        SeverityEnum.info,
        [{
          text: TYPO3.lang.ok,
          active: true,
          btnClass: 'btn-info',
          name: 'ok',
          trigger: (e: Event, modal: ModalElement) => modal.hideModal(),
        }],
        ['modal-inner-scroll'],
      );
    });
  };

  /**
   * This is used to reset the records, internally stored for
   * mass actions. This is needed as those records may no
   * longer be available in the current view and would therefore
   * led to misbehaviour as "unrelated" records get processed.
   *
   * Furthermore, the mass action "bar" is initialized in case the
   * current view contains records. Also a custom event is being
   * dispatched to hide the mass actions, which are only available
   * when at least one record is selected.
   *
   * @param hasRecords Whether the current view contains records
   */
  private resetMassActionState(hasRecords: boolean): void {
    this.markedRecordsForMassAction = [];
    if (hasRecords) {
      this.elements.$workspaceActions.removeClass('hidden');
      this.elements.$chooseMassAction.prop('disabled', false);
    }
    document.dispatchEvent(new CustomEvent('multiRecordSelection:actions:hide'));
  }
}

export default new Backend();
