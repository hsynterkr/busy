import _ from 'lodash';
import { createAction } from 'redux-actions';
import formatter from '../helpers/steemitFormatter';
import { createAsyncActionType, getUserDetailsKey } from '../helpers/stateHelpers';
import {
  getAccountHistory,
  getDynamicGlobalProperties,
  isWalletTransaction,
  defaultAccountLimit,
} from '../helpers/apiHelpers';
import { getTearDropsBalance, getTearDropsTransactions } from '../helpers/steemEngineHelper';
import { ACTIONS_DISPLAY_LIMIT, actionsFilter } from '../helpers/accountHistoryHelper';

export const OPEN_TRANSFER = '@wallet/OPEN_TRANSFER';
export const CLOSE_TRANSFER = '@wallet/CLOSE_TRANSFER';
export const OPEN_POWER_UP_OR_DOWN = '@wallet/OPEN_POWER_UP_OR_DOWN';
export const CLOSE_POWER_UP_OR_DOWN = '@wallet/CLOSE_POWER_UP_OR_DOWN';
export const GET_GLOBAL_PROPERTIES = createAsyncActionType('@wallet/GET_GLOBAL_PROPERTIES');
export const GET_USER_ACCOUNT_HISTORY = createAsyncActionType('@users/GET_USER_ACCOUNT_HISTORY');
export const GET_MORE_USER_ACCOUNT_HISTORY = createAsyncActionType(
  '@users/GET_MORE_USER_ACCOUNT_HISTORY',
);
export const GET_USER_EST_ACCOUNT_VALUE = createAsyncActionType(
  '@users/GET_USER_EST_ACCOUNT_VALUE',
);
export const UPDATE_ACCOUNT_HISTORY_FILTER = '@users/UPDATE_ACCOUNT_HISTORY_FILTER';
export const SET_INITIAL_CURRENT_DISPLAYED_ACTIONS = '@users/SET_INITIAL_CURRENT_DISPLAYED_ACTIONS';
export const ADD_MORE_ACTIONS_TO_CURRENT_DISPLAYED_ACTIONS =
  '@users/ADD_MORE_ACTIONS_TO_CURRENT_DISPLAYED_ACTIONS';
export const UPDATE_FILTERED_ACTIONS = '@users/UPDATE_FILTERED_ACTIONS';
export const LOADING_MORE_USERS_ACCOUNT_HISTORY = '@users/LOADING_MORE_USERS_ACCOUNT_HISTORY';
export const GET_USER_TEARDROPS_BALANCE = createAsyncActionType(
  '@wallet/GET_USER_TEARDROPS_BALANCE',
);

export const openTransfer = createAction(OPEN_TRANSFER);
export const closeTransfer = createAction(CLOSE_TRANSFER);

export const openPowerUpOrDown = createAction(OPEN_POWER_UP_OR_DOWN);
export const closePowerUpOrDown = createAction(CLOSE_POWER_UP_OR_DOWN);

const getParsedUserActions = userActions => {
  const userWalletTransactions = [];
  const userTokenTransactions = [];
  const userAccountHistory = [];

  _.each(userActions.reverse(), action => {
    const actionCount = action[0];
    const actionDetails = {
      ...action[1],
      actionCount,
    };

    const actionType =
      actionDetails.op && actionDetails.op[0] ? actionDetails.op[0] : 'tokenAction';

    if (isWalletTransaction(actionType)) {
      userWalletTransactions.push(actionDetails);
    }

    if (actionType === 'transfer_tokens') {
      userTokenTransactions.push(actionDetails);
    }

    userAccountHistory.push(actionDetails);
  });

  return {
    userWalletTransactions,
    userTokenTransactions,
    userAccountHistory,
  };
};

const getAllAccountHistory = username =>
  Promise.all([getTearDropsTransactions(username), getAccountHistory(username)]).then(userActions =>
    userActions[0].concat(userActions[1]),
  );

const getMoreAllAccountHistory = (username, start, limit) =>
  Promise.all([
    getTearDropsTransactions(username, start, limit),
    getAccountHistory(username, start, limit),
  ]).then(userActions => userActions[0].concat(userActions[1]));

export const getGlobalProperties = () => dispatch =>
  dispatch({
    type: GET_GLOBAL_PROPERTIES.ACTION,
    payload: {
      promise: getDynamicGlobalProperties(),
    },
  });

export const getUserAccountHistory = username => dispatch =>
  dispatch({
    type: GET_USER_ACCOUNT_HISTORY.ACTION,
    payload: {
      promise: getAllAccountHistory(username).then(userActions => {
        const parsedUserActions = getParsedUserActions(userActions);

        return {
          username,
          userWalletTransactions: parsedUserActions.userWalletTransactions,
          userTokenTransactions: parsedUserActions.userTokenTransactions,
          userAccountHistory: parsedUserActions.userAccountHistory,
        };
      }),
    },
  });

export const getMoreUserAccountHistory = (username, start, limit) => dispatch =>
  dispatch({
    type: GET_MORE_USER_ACCOUNT_HISTORY.ACTION,
    payload: {
      promise: getMoreAllAccountHistory(username, start, limit).then(userActions => {
        const parsedUserActions = getParsedUserActions(userActions);
        return {
          username,
          userWalletTransactions: parsedUserActions.userWalletTransactions,
          userTokenTransactions: parsedUserActions.userTokenTransactions,
          userAccountHistory: parsedUserActions.userAccountHistory,
        };
      }),
    },
  });

export const getUserEstAccountValue = user => dispatch =>
  dispatch({
    type: GET_USER_EST_ACCOUNT_VALUE.ACTION,
    payload: {
      promise: formatter.estimateAccountValue(user).then(value => ({
        username: user.name,
        value,
      })),
    },
  });

export const updateAccountHistoryFilter = createAction(UPDATE_ACCOUNT_HISTORY_FILTER);

export const setInitialCurrentDisplayedActions = createAction(
  SET_INITIAL_CURRENT_DISPLAYED_ACTIONS,
);

export const addMoreActionsToCurrentDisplayedActions = createAction(
  ADD_MORE_ACTIONS_TO_CURRENT_DISPLAYED_ACTIONS,
);

export const loadingMoreUsersAccountHistory = createAction(LOADING_MORE_USERS_ACCOUNT_HISTORY);

export const loadMoreCurrentUsersActions = username => (dispatch, getState) => {
  dispatch(loadingMoreUsersAccountHistory());
  const { wallet } = getState();
  const { usersAccountHistory, currentDisplayedActions, accountHistoryFilter } = wallet;
  const currentUsersActions = _.get(usersAccountHistory, getUserDetailsKey(username), []);
  const lastDisplayedAction = _.last(currentDisplayedActions);

  if (_.isEmpty(lastDisplayedAction)) {
    dispatch(setInitialCurrentDisplayedActions(username));
    return;
  }

  const lastDisplayedActionCount = lastDisplayedAction.actionCount;
  const lastDisplayedActionIndex = _.findIndex(
    currentUsersActions,
    userAction => userAction.actionCount === lastDisplayedActionCount,
  );
  const moreActions = currentUsersActions.slice(
    lastDisplayedActionIndex + 1,
    lastDisplayedActionIndex + 1 + ACTIONS_DISPLAY_LIMIT,
  );
  const lastMoreAction = _.last(moreActions);
  const lastMoreActionCount = _.isEmpty(lastMoreAction) ? 0 : lastMoreAction.actionCount;

  if (moreActions.length === ACTIONS_DISPLAY_LIMIT || lastMoreActionCount === 0) {
    const filteredMoreActions = _.filter(moreActions, userAction =>
      actionsFilter(userAction, accountHistoryFilter, username),
    );
    dispatch(
      addMoreActionsToCurrentDisplayedActions({
        moreActions,
        filteredMoreActions,
      }),
    );
  } else {
    const lastActionCount = _.last(currentUsersActions).actionCount;
    const limit = lastActionCount < defaultAccountLimit ? lastActionCount : defaultAccountLimit;
    dispatch(getMoreUserAccountHistory(username, lastActionCount, limit));
  }
};

export const getUserTearDrops = username => dispatch =>
  dispatch({
    type: GET_USER_TEARDROPS_BALANCE.ACTION,
    payload: {
      promise: getTearDropsBalance(username).then(balance => balance),
    },
  });
