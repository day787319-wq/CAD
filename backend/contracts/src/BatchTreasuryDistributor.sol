// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
//20260121 0919
/**
 * @title BatchTreasuryDistributor
 * @notice 通用的资金托管 + 批量分发合约（ETH + ERC20）
 * @dev 设计目标：可读、可审计、兼容非标准 ERC20、减少误用风险
 */
interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

/**
 * @dev 简化版 SafeERC20：兼容“返回 bool”与“无返回值”的 ERC20
 *      - 某些老币（典型如 USDT）transfer 不返回 bool（或返回值不规范）
 *      - 这里用 low-level call 判断成功与返回数据
 */
library SafeERC20Lite {
    error TokenCallFailed();

    function safeTransfer(address token, address to, uint256 amount) internal {
        // selector: transfer(address,uint256)
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Like.transfer.selector, to, amount)
        );

        // ok 必须为 true；若 data 有内容，则必须能解码为 true
        if (!ok) revert TokenCallFailed();
        if (data.length > 0) {
            // 有返回值的 token：要求返回 true
            if (!abi.decode(data, (bool))) revert TokenCallFailed();
        }
    }
}

/**
 * @dev 最小 Ownable（避免引入外部库）
 */
abstract contract OwnableLite {
    address public owner;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error NewOwnerIsZero();

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert NewOwnerIsZero();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract BatchTreasuryDistributor is OwnableLite {
    using SafeERC20Lite for address;

    event Received(address indexed from, uint256 amount);
    event EthSent(address indexed to, uint256 amount);
    event TokenSent(address indexed token, address indexed to, uint256 amount);
    event Swept(address indexed token, uint256 amount);
    event SweptETH(uint256 amount);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice 批量分发：每个 index 可以选择发 ETH、发指定 ERC20
     * @param recipients   收款地址列表
     * @param ethAmounts   每个地址对应要发送的 ETH 数量（可为 0）
     * @param tokens       每个地址对应要发送的 token 地址（可为 address(0) 表示不发 token）
     * @param tokenAmounts 每个地址对应要发送的 token 数量（可为 0）
     *
     * @dev 重要约束：
     *      - 四个数组长度必须完全一致
     *      - ETH 使用 call 发送（兼容合约地址），失败则 revert
     *      - ERC20 使用 safeTransfer（兼容不返回 bool 的 token）
     */
    function batchSend(
        address[] calldata recipients,
        uint256[] calldata ethAmounts,
        address[] calldata tokens,
        uint256[] calldata tokenAmounts
    ) external payable onlyOwner {
        uint256 n = recipients.length;
        require(
            ethAmounts.length == n &&
            tokens.length == n &&
            tokenAmounts.length == n,
            "length mismatch"
        );

        for (uint256 i = 0; i < n; i++) {
            address to = recipients[i];

            // 1) 发 ETH（可选）
            uint256 ethAmt = ethAmounts[i];
            if (ethAmt > 0) {
                (bool ok, ) = payable(to).call{value: ethAmt}("");
                require(ok, "ETH send failed");
                emit EthSent(to, ethAmt);
            }

            // 2) 发 Token（可选）
            uint256 tokAmt = tokenAmounts[i];
            address token = tokens[i];
            if (tokAmt > 0) {
                require(token != address(0), "token=0");
                token.safeTransfer(to, tokAmt);
                emit TokenSent(token, to, tokAmt);
            }
        }
    }

    /**
     * @notice 把合约里所有 ETH 提走给 owner
     */
    function sweepETH() external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal > 0) {
            (bool ok, ) = payable(owner).call{value: bal}("");
            require(ok, "sweep ETH failed");
            emit SweptETH(bal);
        }
    }

    /**
     * @notice 把合约里指定 token 的全部余额提走给 owner
     * @param token token 合约地址
     */
    function sweepToken(address token) external onlyOwner {
        require(token != address(0), "token=0");
        uint256 bal = IERC20Like(token).balanceOf(address(this));
        if (bal > 0) {
            token.safeTransfer(owner, bal);
            emit Swept(token, bal);
        }
    }

    /**
     * @notice 一次性提走多个 token（便于运维）
     */
    function sweepTokens(address[] calldata tokens) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            if (t == address(0)) continue;
            uint256 bal = IERC20Like(t).balanceOf(address(this));
            if (bal > 0) {
                t.safeTransfer(owner, bal);
                emit Swept(t, bal);
            }
        }
    }
}
