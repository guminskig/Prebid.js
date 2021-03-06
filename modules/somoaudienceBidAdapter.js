import * as utils from 'src/utils';
import { registerBidder } from 'src/adapters/bidderFactory';
import includes from 'core-js/library/fn/array/includes';
import {BANNER, VIDEO} from 'src/mediaTypes';

const VIDEO_TARGETING = ['mimes', 'minduration', 'maxduration', 'protocols',
  'startdelay', 'linearity', 'skip', 'delivery',
  'pos', 'api', 'ext', 'battr'];
const BANNER_TARGETING = ['battr', 'btype', 'pos', 'mimes', 'ext'];

const SITE_TARGETING = ['name', 'domain', 'cat', 'keywords', 'content']
const APP_TARGETING = ['name', 'bundle', 'domain', 'storeUrl', 'cat', 'ver', 'keywords', 'content']

export const spec = {

  code: 'somoaudience',

  supportedMediaTypes: [BANNER, VIDEO],
  aliases: ['somo'],

  isBidRequestValid: bid => (
    !!(bid && bid.params && bid.params.placementId)
  ),

  buildRequests: function(bidRequests, bidderRequest) {
    return bidRequests.map(bidRequest => {
      let da = openRtbRequest(bidRequest, bidderRequest);
      if (window.top1 && window.top1.realvu_aa) {
        let a = window.top1.realvu_aa.check({
          unit_id: bidRequest.adUnitCode,
          size: bidRequest.sizes,
          partner_id: 'E321'
        });
        a.rq_bids.push({
          bidder: bidRequest.bidder,
          adId: bidRequest.bidId,
          partner_id: 'E321'
        });
        if (a.riff == 'yes') {
          da.imp[0].pmp = {
            private_auction: 0,
            deals: [
              {
                id: 'realvu',
                bidfloor: 1.5
              }
            ]
          };
        }
      }
      return {
        method: 'POST',
        url: '//publisher-east.mobileadtrading.com/rtb/bid?s=' + bidRequest.params.placementId.toString(),
        data: da,
        bidRequest: bidRequest
      };
    });
  },

  interpretResponse(response, request) {
    return bidResponseAvailable(request, response);
  },

  getUserSyncs: (syncOptions, serverResponses, gdprConsent) => {
    const syncs = [];
    var url = '//publisher-east.mobileadtrading.com/usersync';

    if (syncOptions.pixelEnabled) {
      if (gdprConsent && typeof gdprConsent.consentString === 'string') {
        // add 'gdpr' only if 'gdprApplies' is defined
        if (typeof gdprConsent.gdprApplies === 'boolean') {
          url += `?gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`;
        }
      }
      syncs.push({
        type: 'image',
        url: url
      });
    }
    return syncs;
  }
};

function bidResponseAvailable(bidRequest, bidResponse) {
  let bidResponses = [];
  if (bidResponse.body) {
    let bidData = bidResponse.body.seatbid[0].bid[0];
    const bid = {
      requestId: bidData.impid,
      cpm: bidData.price,
      width: bidData.w,
      height: bidData.h,
      ad: bidData.adm,
      ttl: 360,
      creativeId: bidData.crid,
      adId: bidData.impid,
      netRevenue: false,
      currency: 'USD',
    };
    if (isVideo(bidRequest.bidRequest)) {
      bid.vastXml = bidData.adm;
      bid.mediaType = 'video';
    } else {
      bid.ad = bidData.adm;
      bid.mediaType = 'banner';
    }
    bidResponses.push(bid);
  }
  return bidResponses;
}

function openRtbRequest(bidRequest, bidderRequest) {
  var openRtbRequest = {
    id: bidRequest.bidderRequestId,
    imp: [openRtbImpression(bidRequest)],
    at: 1,
    tmax: 400,
    site: openRtbSite(bidRequest),
    app: openRtbApp(bidRequest),
    device: openRtbDevice(),
    bcat: openRtbBCat(bidRequest),
    badv: openRtbBAdv(bidRequest),
    ext: {
      prebid: '$prebid.version$',
    },
  };
  if (bidderRequest != undefined) {
    openRtbRequest = populateOpenRtbGdpr(bidderRequest.gdprConsent, openRtbRequest);
  }

  return openRtbRequest;
}

function populateOpenRtbGdpr(gdpr, bidRequest) {
  if (gdpr && bidRequest && 'gdprApplies' in gdpr) {
    if (!('reqs' in bidRequest)) {
      bidRequest.reqs = {};
    }
    if (!('ext' in bidRequest.reqs)) {
      bidRequest.reqs.ext = {};
    }
    bidRequest.reqs.ext.gdpr = gdpr.gdprApplies;

    if ('consentString' in gdpr) {
      if (!('user' in bidRequest)) {
        bidRequest.user = {};
      }
      if (!('ext' in bidRequest.user)) {
        bidRequest.user.ext = {};
      }
      bidRequest.user.ext.consent = gdpr.consentString;
    }
  }

  return bidRequest;
}

function openRtbImpression(bidRequest) {
  const imp = {
    'id': bidRequest.bidId,
    bidfloor: bidRequest.params.bidfloor || 0,
  };
  if (isVideo(bidRequest)) {
    imp.video = {};
    if (bidRequest.sizes) {
      const sizes = getSizes(bidRequest.sizes);
      imp.video.w = sizes[0];
      imp.video.h = sizes[1];
    }
    if (bidRequest.params.video) {
      Object.keys(bidRequest.params.video)
        .filter(param => includes(VIDEO_TARGETING, param))
        .forEach(param => imp.video[param] = bidRequest.params.video[param]);
    }
  } else {
    imp.banner = {
      topframe: 0
    };
    if (bidRequest.sizes) {
      const sizes = getSizes(bidRequest.sizes);
      imp.banner.w = sizes[0];
      imp.banner.h = sizes[1];
    }
    if (bidRequest.params.banner) {
      Object.keys(bidRequest.params.banner)
        .filter(param => includes(BANNER_TARGETING, param))
        .forEach(param => imp.banner[param] = bidRequest.params.banner[param]);
    }
  }
  return imp;
}

function isApp(bidRequest) {
  if (bidRequest.params.app) {
    return true;
  } else {
    return false;
  }
}

function openRtbSite(bidRequest) {
  if (!isApp(bidRequest)) {
    const site = {
      ref: utils.getTopWindowReferrer(),
      page: utils.getTopWindowLocation().href
    };
    if (bidRequest.params.site) {
      Object.keys(bidRequest.params.site)
        .filter(param => includes(SITE_TARGETING, param))
        .forEach(param => site[param] = bidRequest.params.site[param]);
    }
    if (site.domain == undefined) {
      site.domain = utils.getTopWindowLocation().hostname;
    }

    return site;
  } else {
    return null;
  }
}

function openRtbApp(bidRequest) {
  if (isApp(bidRequest)) {
    const app = {

    }
    Object.keys(bidRequest.params.app)
      .filter(param => includes(APP_TARGETING, param))
      .forEach(param => app[param] = bidRequest.params.app[param]);

    return app;
  } else {
    return null;
  }
}

function openRtbDevice() {
  return {
    ip: 'check',
    ua: navigator.userAgent,
    language: (navigator.language || navigator.browserLanguage || navigator.userLanguage || navigator.systemLanguage),
  };
}

function openRtbBCat(bidRequest) {
  if (utils.isArray(bidRequest.params.bcat)) {
    return bidRequest.params.bcat;
  }
  return [];
}

function openRtbBAdv(bidRequest) {
  if (utils.isArray(bidRequest.params.badv)) {
    return bidRequest.params.badv;
  }
  return [];
}

function isVideo (format) {
  return utils.deepAccess(format, 'mediaTypes.video') || format.mediaType == 'video';
}

/* Turn bid request sizes into compatible format */
function getSizes(requestSizes) {
  let width = 0;
  let height = 0;
  if (utils.isArray(requestSizes) && requestSizes.length === 2 &&
    !utils.isArray(requestSizes[0])) {
    width = parseInt(requestSizes[0], 10);
    height = parseInt(requestSizes[1], 10);
  } else if (typeof requestSizes === 'object') {
    for (let i = 0; i < requestSizes.length; i++) {
      let size = requestSizes[i];
      width = parseInt(size[0], 10);
      height = parseInt(size[1], 10);
      break;
    }
  }
  return [width, height];
}

registerBidder(spec);
